import pandas as pd
import numpy as np
from datetime import datetime, timedelta
from supabase import Client
import joblib
# Try importing the probability service, handling both module and script execution contexts
try:
    from .probability_service import calculate_mastitis_probability
except ImportError:
    try:
        from app.probability_service import calculate_mastitis_probability
    except ImportError:
        try:
            from backend.app.probability_service import calculate_mastitis_probability
        except ImportError:
            print("Warning: Could not import probability_service. Probability calculation will be skipped.")
            def calculate_mastitis_probability(db, c, p): return None

def process_mdi_predictions(
    db: Client, 
    farm_id: str, 
    model, 
    new_sessions_oid: list[int]
):
    """
    Orchestrates the creation of the MDI Predictor Master Table row and runs inference.
    
    Triggered when new sessions are ingested.
    """
    if not new_sessions_oid or not model:
        print(f"SKIPPING PREDICTION: new_sessions_oid count={len(new_sessions_oid) if new_sessions_oid else 0}, model_loaded={bool(model)}")
        return

    try:
        print(f"--- STARTING MDI PREDICTION for Farm {farm_id} ---")
        print(f"Processing {len(new_sessions_oid)} new session OIDs.")

        # 1. Fetch Data Needed for Context (Last 21 sessions for MA)
        # We need to query Supabase to get the joined data for the specific animals involved in the new sessions
        # For simplicity and performance, we'll fetch a bit more data than strictly needed (e.g. last 30 days) 
        # for the animals in the current batch.
        
        # Get the list of animals involved in the new sessions
        # In a real efficient implementation, we might want to do this via a stored procedure or careful querying.
        # Here we fetch data for the relevant farm.
        
        # Step A: Get the raw data from the DB for the JOIN
        # We need: DELPRO_sessions_milk_yield (s) AND DELPRO_voluntary_sessions_milk_yield (v)
        # Join on OID.
        
        # Fetching recent data (e.g. last 7 days) to calculate moving averages
        # Use 7 days as requested to ensure we catch enough sessions for context but not too old data
        
        # Primary strategy: Last 7 days from NOW
        cutoff_date = (datetime.now() - timedelta(days=7)).isoformat()
        print(f"Fetching data since {cutoff_date} (Strategy: Recent)")
        
        # Fetch Session Data (s)
        print("Fetching DELPRO_sessions_milk_yield...")
        res_s = db.table("DELPRO_sessions_milk_yield")\
            .select("OID, BeginTime, EndTime, BasicAnimal, TotalYield, AvgConductivity, MaxBlood, ExpectedYield")\
            .eq("farm_id", farm_id)\
            .gte("BeginTime", cutoff_date)\
            .execute()
        
        df_s = pd.DataFrame(res_s.data)
        
        # Fallback strategy: If no data found, try hardcoded date (11/09/2019)
        # This is useful for testing with historical datasets
        if df_s.empty:
            print("WARNING: No recent data found. Switching to FALLBACK strategy (Historical Data).")
            # Fallback date
            fallback_base_date = datetime(2025, 11, 22)
            cutoff_date = (fallback_base_date - timedelta(days=7)).isoformat()
            print(f"Fetching data since {cutoff_date} (Strategy: Fallback)")
            
            res_s = db.table("DELPRO_sessions_milk_yield")\
                .select("OID, BeginTime, EndTime, BasicAnimal, TotalYield, AvgConductivity, MaxBlood, ExpectedYield")\
                .eq("farm_id", farm_id)\
                .gte("BeginTime", cutoff_date)\
                .execute()
            df_s = pd.DataFrame(res_s.data)

        if df_s.empty:
            print("WARNING: No session data found even with fallback strategy. Cannot proceed.")
            return
        print(f"Found {len(df_s)} rows in Sessions table.")

        # Fetch Voluntary Data (v)
        print("Fetching DELPRO_voluntary_sessions_milk_yield...")
        
        # Get OIDs from the sessions we found
        session_oids = df_s['OID'].tolist()
        
        if not session_oids:
             print("No sessions found, skipping voluntary data fetch.")
             return

        # Fetch voluntary data matching the session OIDs
        # Using .in_() to filter by OID list
        res_v = db.table("DELPRO_voluntary_sessions_milk_yield")\
            .select("OID, Mdi, MilkFlowDuration, SmartPulsationRatio, CurrentCombinedAmd, Incomplete, Kickoff")\
            .eq("farm_id", farm_id)\
            .in_("OID", session_oids)\
            .execute()
        
        df_v = pd.DataFrame(res_v.data)
        print(f"Found {len(df_v)} rows in Voluntary table matching OIDs.")
        
        # Join them on OID
        df = pd.merge(df_s, df_v, on="OID", how="inner")
        print(f"Rows after INNER JOIN on OID: {len(df)}")
        
        if df.empty:
            print("WARNING: Join resulted in 0 rows. Check if OIDs match between tables.")
            return
        df['BeginTime'] = pd.to_datetime(df['BeginTime'])
        
        # Sort by Animal and Time
        df = df.sort_values(by=['BasicAnimal', 'BeginTime'])
        
        # 2. Calculate Moving Averages
        # We need to calculate these per animal
        
        # Define window functions
        # 15 sessions windows (min_periods=1 means it will average whatever is available if < 15)
        cols_15 = ['AvgConductivity', 'MaxBlood', 'Mdi', 'MilkFlowDuration', 'SmartPulsationRatio', 'CurrentCombinedAmd']
        for col in cols_15:
            if col in df.columns:
                # rolling(window=15, min_periods=1) ensures that if we have fewer than 15 sessions, 
                # we still compute the average of available sessions.
                df[f'{col}_ma15'] = df.groupby('BasicAnimal')[col].transform(lambda x: x.rolling(window=15, min_periods=1).mean())
        
        # 21 sessions windows (min_periods=1 means it will average whatever is available if < 21)
        cols_21 = ['TotalYield', 'ExpectedYield']
        for col in cols_21:
            if col in df.columns:
                # rolling(window=21, min_periods=1) ensures that if we have fewer than 21 sessions, 
                # we still compute the average of available sessions.
                df[f'{col}_ma21'] = df.groupby('BasicAnimal')[col].transform(lambda x: x.rolling(window=21, min_periods=1).mean())
        
        # 3. Calculate Contextual Features (LactationNumber, DIM)
        # Fetch Lactation Summary
        res_lact = db.table("DELPRO_animals_lactations_summary")\
            .select("Animal, LactationNumber, StartDate")\
            .eq("farm_id", farm_id)\
            .execute()
            
        df_lact = pd.DataFrame(res_lact.data)
        
        if not df_lact.empty:
            # We want the *current* lactation for each session.
            # Simple approximation: Merge on Animal and take the latest LactationNumber available
            # A more precise way would be to check if BeginTime is between StartDate and EndDate.
            
            # Let's keep it simple: Get max lactation number for the animal
            # (assuming we are processing recent data)
            df_lact_max = df_lact.sort_values('LactationNumber', ascending=False).drop_duplicates('Animal')
            df_lact_max = df_lact_max.rename(columns={'Animal': 'BasicAnimal'})
            
            df = pd.merge(df, df_lact_max[['BasicAnimal', 'LactationNumber', 'StartDate']], on='BasicAnimal', how='left')
            
            # Calculate DIM
            df['StartDate'] = pd.to_datetime(df['StartDate'])
            df['DIM'] = (df['BeginTime'] - df['StartDate']).dt.days
            df['DIM'] = df['DIM'].fillna(0)
        else:
            df['LactationNumber'] = 0
            df['DIM'] = 0

        print(f"Rows after feature calculation: {df.head()}")
        print(f"New sessions OID: {new_sessions_oid}")
        # 4. Filter for ONLY the new sessions we just ingested
        # We calculated features on history, but we only want to predict/save for the new rows.
        df_new = df[df['OID'].isin(new_sessions_oid)].copy()
        
        if df_new.empty:
            print("No new sessions found after processing.")
            return

        # 5. Prepare for Prediction
        # Select features expected by the model
        # NOTE: You must ensure these match exactly what your .joblib model expects
        feature_cols = [
            "Mdi", "TotalYield", "AvgConductivity", "MaxBlood", "MilkFlowDuration", 
            "SmartPulsationRatio", "CurrentCombinedAmd", "Incomplete", "Kickoff",
            "AvgConductivity_ma15", "MaxBlood_ma15", "Mdi_ma15", "MilkFlowDuration_ma15",
            "SmartPulsationRatio_ma15", "CurrentCombinedAmd_ma15", "TotalYield_ma21",
            "ExpectedYield_ma21", "LactationNumber", "DIM"
        ]
        
        # Handle missing values (NaN) - Simple imputation with 0
        pd.set_option('future.no_silent_downcasting', True) # Opt-in to future behavior
        X = df_new[feature_cols].fillna(0)
        
        # 6. Run Inference
        try:
            # Check feature names if model supports it (sklearn > 1.0)
            if hasattr(model, "feature_names_in_"):
                # Reorder columns to match model's expectations
                X = X[model.feature_names_in_]
            
            predictions = model.predict(X)
            df_new['mdi_2d'] = predictions
            
            # 6b. Calculate Mastitis Probability using the Logistic Regression Model
            # We do this row by row (or vectorised if we refactored probability_service, but row-by-row is safer for now with the cache logic)
            probs = []
            for _, row in df_new.iterrows():
                curr_mdi = row.get("Mdi")
                pred_mdi = row.get("mdi_2d")
                prob = calculate_mastitis_probability(db, curr_mdi, pred_mdi)
                probs.append(prob)
            df_new['prob_mastitis'] = probs
            
        except Exception as e:
            print(f"Inference failed: {e}")
            return

        # 7. Save to Supabase (mdi_predictor_mastertable)
        # Prepare records
        records_to_insert = []
        for _, row in df_new.iterrows():
            record = {
                "farm_id": farm_id,
                "session_oid": int(row["OID"]),
                "animal_oid": int(row["BasicAnimal"]),
                
                # Raw
                "Mdi": row.get("Mdi"),
                "TotalYield": row.get("TotalYield"),
                "AvgConductivity": row.get("AvgConductivity"),
                "MaxBlood": row.get("MaxBlood"),
                "MilkFlowDuration": row.get("MilkFlowDuration"),
                "SmartPulsationRatio": row.get("SmartPulsationRatio"),
                "CurrentCombinedAmd": row.get("CurrentCombinedAmd"),
                "Incomplete": int(row.get("Incomplete", 0)),
                "Kickoff": int(row.get("Kickoff", 0)),
                
                # Calculated
                "AvgConductivity_ma15": row.get("AvgConductivity_ma15"),
                "MaxBlood_ma15": row.get("MaxBlood_ma15"),
                "Mdi_ma15": row.get("Mdi_ma15"),
                "MilkFlowDuration_ma15": row.get("MilkFlowDuration_ma15"),
                "SmartPulsationRatio_ma15": row.get("SmartPulsationRatio_ma15"),
                "CurrentCombinedAmd_ma15": row.get("CurrentCombinedAmd_ma15"),
                "TotalYield_ma21": row.get("TotalYield_ma21"),
                "ExpectedYield_ma21": row.get("ExpectedYield_ma21"),
                
                "LactationNumber": int(row.get("LactationNumber", 0)),
                "DIM": row.get("DIM"),

                # Times
                # Pandas converts timestamps to Timestamp objects, but if they are already strings (from Supabase response)
                # or if we converted them earlier.
                # 'BeginTime' was converted to datetime at line ~95: df['BeginTime'] = pd.to_datetime(df['BeginTime'])
                # But 'EndTime' might still be a string or object if we didn't explicitly convert it.
                # Let's ensure we handle both cases safely.
                
                "BeginTime": row["BeginTime"].isoformat() if isinstance(row.get("BeginTime"), (pd.Timestamp, datetime)) else row.get("BeginTime"),
                "EndTime": row["EndTime"].isoformat() if isinstance(row.get("EndTime"), (pd.Timestamp, datetime)) else row.get("EndTime"),
                
                # Prediction
                "mdi_2d": row.get("mdi_2d"),
                "prob_mastitis": row.get("prob_mastitis")
            }
            # Clean up NaNs/Infs for JSON serialization
            for k, v in record.items():
                if isinstance(v, float) and (np.isnan(v) or np.isinf(v)):
                    record[k] = None
                    
            records_to_insert.append(record)

        if records_to_insert:
            db.table("mdi_predictor_mastertable").insert(records_to_insert).execute()
            print(f"Successfully processed and saved {len(records_to_insert)} predictions.")

    except Exception as e:
        print(f"Error in process_mdi_predictions: {e}")
        import traceback
        traceback.print_exc()

# Delete this part if the script is not executed manually

if __name__ == "__main__":
    import os
    from dotenv import load_dotenv
    from supabase import create_client

    # Load env vars
    # Assumes .env is in backend/.env (relative to backend/app/predictor_service.py)
    load_dotenv(os.path.join(os.path.dirname(__file__), '../.env'))

    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_KEY")
    
    if not url or not key:
        print("Error: SUPABASE_URL or SUPABASE_KEY not found in environment.")
        exit(1)

    db = create_client(url, key)

    # Load model
    model_path = os.path.join(os.path.dirname(__file__), "ml_models/mdi_predictor_2d.joblib")
    if not os.path.exists(model_path):
        print(f"Error: Model not found at {model_path}")
        exit(1)
    
    model = joblib.load(model_path)
    print(f"Model loaded from {model_path}")

    # Fetch farm (just pick first one or hardcode if testing)
    res = db.table("farms").select("id").limit(1).execute()
    if not res.data:
        print("No farm found.")
        exit(1)
    farm_id = res.data[0]['id']
    print(f"Using Farm ID: {farm_id}")

    # Fetch recent sessions to simulate "new" sessions
    # We fetch based on the same time logic as the predictor (Last 7 days or Fallback)
    
    # 1. Try Recent Strategy (Last 7 days)
    cutoff_date = (datetime.now() - timedelta(days=7)).isoformat()
    print(f"Fetching sessions since {cutoff_date} (Strategy: Recent)...")
    
    res_s = db.table("DELPRO_sessions_milk_yield")\
        .select("OID")\
        .eq("farm_id", farm_id)\
        .gte("BeginTime", cutoff_date)\
        .execute()
    
    # 2. Fallback Strategy (Nov 2025) if no data found
    if not res_s.data:
        print("No recent data found. Switching to FALLBACK strategy (Historical Data).")
        fallback_base_date = datetime(2025, 11, 22)
        cutoff_date = (fallback_base_date - timedelta(days=7)).isoformat()
        print(f"Fetching sessions since {cutoff_date} (Strategy: Fallback)...")
        
        res_s = db.table("DELPRO_sessions_milk_yield")\
            .select("OID")\
            .eq("farm_id", farm_id)\
            .gte("BeginTime", cutoff_date)\
            .execute()
    
    if not res_s.data:
        print("No sessions found even with fallback strategy.")
        exit(1)

    new_sessions_oid = [r['OID'] for r in res_s.data]
    print(f"Found {len(new_sessions_oid)} sessions to process.")
    
    # Run
    process_mdi_predictions(db, farm_id, model, new_sessions_oid)
