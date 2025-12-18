import time
from datetime import datetime, timedelta
from supabase import Client

# Simple in-memory cache
_CONFIG_CACHE = {
    "data": None,
    "expires_at": 0
}

CACHE_TTL_SECONDS = 300  # 5 minutes

def get_latest_model_config(db: Client):
    """
    Fetches the latest logistic regression coefficients from system_model_config.
    Uses a simple time-based cache to avoid hitting the DB on every single row/request.
    """
    global _CONFIG_CACHE
    now = time.time()
    
    if _CONFIG_CACHE["data"] and now < _CONFIG_CACHE["expires_at"]:
        return _CONFIG_CACHE["data"]
    
    try:
        # Fetch the latest config ordered by updated_at desc
        res = db.table("system_model_config")\
            .select("*")\
            .order("updated_at", desc=True)\
            .limit(1)\
            .execute()
        
        if res.data:
            config = res.data[0]
            _CONFIG_CACHE["data"] = config
            _CONFIG_CACHE["expires_at"] = now + CACHE_TTL_SECONDS
            return config
        else:
            # Fallback default weights if no training has run yet
            # Heuristic defaults (Softer Curve): 
            # Intercept: -4.5 (Base prob low)
            # MDI Coef: 2.0 (Instead of 4.0, makes curve less steep)
            # Predicted Coef: 0.5 (Gives some weight to prediction)
            
            # Example outputs with these defaults:
            # MDI=1.4 (Attention) -> -4.5 + 2.8 = -1.7 -> Sigmoid(-1.7) = 15% (Low risk)
            # MDI=2.0 (Alert)     -> -4.5 + 4.0 = -0.5 -> Sigmoid(-0.5) = 37% (Medium risk)
            # MDI=3.0 (Critical)  -> -4.5 + 6.0 = +1.5 -> Sigmoid(1.5)  = 81% (High risk)
            return {
                "intercept": -4.5,
                "coef_current_mdi": 2.0, 
                "coef_predicted_mdi": 0.5
            }
            
    except Exception as e:
        print(f"Error fetching model config: {e}")
        # Return safe defaults in case of DB error
        return {
            "intercept": -4.5,
            "coef_current_mdi": 2.0, 
            "coef_predicted_mdi": 0.5
        }

def calculate_mastitis_probability(db: Client, current_mdi: float, predicted_mdi: float) -> float:
    """
    Calculates the probability of mastitis (0.0 to 1.0) using the latest Logistic Regression coefficients.
    
    Formula: P = 1 / (1 + exp(-(Intercept + w1*Current + w2*Predicted)))
    """
    # Handle None values
    if current_mdi is None:
        current_mdi = 0.0
    if predicted_mdi is None:
        predicted_mdi = 0.0
        
    config = get_latest_model_config(db)
    
    intercept = float(config.get("intercept", 0.0))
    w1 = float(config.get("coef_current_mdi", 0.0))
    w2 = float(config.get("coef_predicted_mdi", 0.0))
    
    # Linear combination
    logit = intercept + (w1 * current_mdi) + (w2 * predicted_mdi)
    
    # Sigmoid function
    import math
    try:
        prob = 1.0 / (1.0 + math.exp(-logit))
    except OverflowError:
        # If logit is too extreme
        prob = 0.90 if logit > 0 else 0.0
        
    return prob
