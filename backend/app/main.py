from fastapi import FastAPI, HTTPException, Depends, BackgroundTasks
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.middleware.cors import CORSMiddleware
from fastapi.encoders import jsonable_encoder
from contextlib import asynccontextmanager
from dotenv import load_dotenv
import os
import joblib
from pydantic import BaseModel
from .models import IngestPayload, SyncStatusResponse, FarmRegistrationRequest, FarmRegistrationResponse
from .database import get_supabase_client, get_authenticated_supabase_client
from supabase import Client
from .predictor_service import process_mdi_predictions
from .notification_service import router as notification_router

load_dotenv()

# Global dictionary to hold ML models
ml_models = {}

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Load the ML model
    model_path = os.path.join(os.path.dirname(__file__), "ml_models/mdi_predictor_2d.joblib")
    if os.path.exists(model_path):
        ml_models["mastitis"] = joblib.load(model_path)
        print(f"Model loaded from {model_path}")
    else:
        print(f"Warning: Model not found at {model_path}")
    
    yield
    
    # Clean up the ML models and release the resources
    ml_models.clear()

app = FastAPI(title="Pecus Chain API", lifespan=lifespan)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # Allow all origins for Vercel deployment
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(notification_router)

security = HTTPBearer()

def get_current_user_db(credentials: HTTPAuthorizationCredentials = Depends(security)) -> Client:
    """Dependency to get a Supabase client authenticated with the user's token."""
    return get_authenticated_supabase_client(credentials.credentials)

@app.get("/")
def read_root():
    return {"Hello": "Pecus Chain Intelligence"}

@app.get("/health")
def health_check():
    return {"status": "ok"}

# 0. Registration Endpoint
@app.post("/api/v1/farms/register", response_model=FarmRegistrationResponse)
def register_farm(request: FarmRegistrationRequest, db: Client = Depends(get_supabase_client)):
    try:
        # Create new farm record in Supabase
        # Supabase will auto-generate the UUID if the table is set up correctly (default gen_random_uuid())
        # Or we can let the insert return the generated ID
        data = {
            "name": request.name,
        }
        
        response = db.table("farms").insert(data).execute()
        
        if not response.data:
            raise HTTPException(status_code=500, detail="Failed to create farm record")
            
        created_farm = response.data[0]
        
        return {
            "farm_id": created_farm["id"],
            "name": created_farm["name"],
            "created_at": created_farm["created_at"]
        }
        
    except Exception as e:
        print(f"Error registering farm: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# 1. Handshake Endpoint: Get Last OIDs for Watermark
@app.get("/api/sync/status", response_model=SyncStatusResponse)
def get_sync_status(farm_id: str, db: Client = Depends(get_supabase_client)):
    try:
        print(f"[SyncStatus] Request received for farm_id: {farm_id}")

        # 1. Get Max OID for Sessions
        res_sessions = db.table("DELPRO_sessions_milk_yield")\
            .select("OID")\
            .eq("farm_id", farm_id)\
            .order("OID", desc=True)\
            .limit(1)\
            .execute()
        last_oid = res_sessions.data[0]["OID"] if res_sessions.data else 0

        # 2. Get Max OID for Basic Animals
        res_animals = db.table("DELPRO_basic_animals")\
            .select("OID")\
            .eq("farm_id", farm_id)\
            .order("OID", desc=True)\
            .limit(1)\
            .execute()
        last_animal_oid = res_animals.data[0]["OID"] if res_animals.data else 0

        # 3. Get Max OID for Lactations
        res_lact = db.table("DELPRO_animals_lactations_summary")\
            .select("OID")\
            .eq("farm_id", farm_id)\
            .order("OID", desc=True)\
            .limit(1)\
            .execute()
        last_lactation_oid = res_lact.data[0]["OID"] if res_lact.data else 0

        # 4. Get Max OID for History Milk Diversion Info
        res_history_milk_diversion = db.table("DELPRO_history_milk_diversion_info")\
            .select("OID")\
            .eq("farm_id", farm_id)\
            .order("OID", desc=True)\
            .limit(1)\
            .execute()
        last_history_milk_diversion_oid = res_history_milk_diversion.data[0]["OID"] if res_history_milk_diversion.data else 0
        
        response_data = {
            "last_oid": last_oid,
            "last_animal_oid": last_animal_oid,
            "last_lactation_oid": last_lactation_oid,
            "last_history_milk_diversion_oid": last_history_milk_diversion_oid
        }

        print(f"[SyncStatus] Returning OIDs for farm_id {farm_id}: {response_data}")

        return response_data
        
    except Exception as e:
        print(f"[SyncStatus] Error processing request for farm_id {farm_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

# 2. Ingest Endpoint: Receive Data from Agent
@app.post("/api/v1/ingest")
def ingest_data(payload: IngestPayload, background_tasks: BackgroundTasks, db: Client = Depends(get_supabase_client)):
    status_report = {}

    try:
        # 1. Ingest Basic Animals
        if payload.basic_animals:
            records = [item.dict() for item in payload.basic_animals]
            for r in records: r["farm_id"] = payload.farm_id
            # Use jsonable_encoder to handle datetime serialization for Supabase
            db.table("DELPRO_basic_animals").upsert(jsonable_encoder(records)).execute()
            status_report["basic_animals"] = len(records)

        # 2. Ingest Lactations Summary
        if payload.lactations_summary:
            records = [item.dict() for item in payload.lactations_summary]
            for r in records: r["farm_id"] = payload.farm_id
            db.table("DELPRO_animals_lactations_summary").upsert(jsonable_encoder(records)).execute()
            status_report["lactations_summary"] = len(records)

        # 3. Ingest Sessions Milk Yield
        sessions_oids = []
        if payload.sessions_milk_yield:
            records = [item.dict() for item in payload.sessions_milk_yield]
            for r in records: r["farm_id"] = payload.farm_id
            
            # Upsert
            db.table("DELPRO_sessions_milk_yield").upsert(jsonable_encoder(records)).execute()
            status_report["sessions_milk_yield"] = len(records)
            
            # Keep track of OIDs for processing
            sessions_oids = [r["OID"] for r in records if r.get("OID")]

        # 4. Ingest Voluntary Sessions Milk Yield
        if payload.voluntary_sessions_milk_yield:
            records = [item.dict() for item in payload.voluntary_sessions_milk_yield]
            for r in records: r["farm_id"] = payload.farm_id
            db.table("DELPRO_voluntary_sessions_milk_yield").upsert(jsonable_encoder(records)).execute()
            status_report["voluntary_sessions_milk_yield"] = len(records)

        # 5. Ingest History Milk Diversion Info
        if payload.history_milk_diversion_info:
            records = [item.dict() for item in payload.history_milk_diversion_info]
            for r in records: r["farm_id"] = payload.farm_id
            db.table("DELPRO_history_milk_diversion_info").upsert(jsonable_encoder(records)).execute()
            status_report["history_milk_diversion_info"] = len(records)

        # 6. Ingest History Animals
        if payload.history_animals:
            records = [item.dict() for item in payload.history_animals]
            for r in records: r["farm_id"] = payload.farm_id
            db.table("DELPRO_history_animals").upsert(jsonable_encoder(records)).execute()
            status_report["history_animals"] = len(records)

        # --- Trigger Background Prediction ---
        # Only if we have new sessions and the model is loaded
        if sessions_oids and "mastitis" in ml_models:
            background_tasks.add_task(
                process_mdi_predictions, 
                db, 
                payload.farm_id, 
                ml_models["mastitis"], 
                sessions_oids
            )
        
        return {"status": "success", "counts": status_report}
        
    except Exception as e:
        print(f"Error ingesting: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# --- Web App Endpoints ---

@app.get("/api/v1/webapp/animals")
def get_webapp_animals(db: Client = Depends(get_current_user_db)):
    """
    Get animals for the authenticated user's farm.
    RLS automatically filters the results.
    """
    try:
        response = db.table("DELPRO_basic_animals").select("*").limit(50).execute()
        return response.data
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# --- ML Inference Endpoints ---

class PredictionInput(BaseModel):
    days_in_milk: float

@app.post("/api/v1/predict/mastitis")
def predict_mastitis(input_data: PredictionInput, db: Client = Depends(get_current_user_db)):
    """
    Predict mastitis risk (or yield) based on input data.
    """
    if "mastitis" not in ml_models:
        raise HTTPException(status_code=503, detail="Model not loaded")
    
    try:
        # Prepare input for the model (expecting 2D array)
        features = [[input_data.days_in_milk]]
        prediction = ml_models["mastitis"].predict(features)
        
        return {
            "prediction": prediction[0],
            "unit": "liters_projected" 
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Prediction error: {str(e)}")
