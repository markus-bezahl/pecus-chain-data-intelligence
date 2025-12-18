from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional
import os
from twilio.rest import Client

router = APIRouter(prefix="/api/notifications", tags=["Notifications"])

class WhatsappNotificationRequest(BaseModel):
    message: str
    timestamp: Optional[str] = None

@router.post("/whatsapp")
async def send_whatsapp_notification(request: WhatsappNotificationRequest):
    """
    Endpoint called by Supabase Webhook to trigger WhatsApp notification via Twilio.
    """
    try:
        # Load credentials from env
        account_sid = os.getenv("TWILIO_ACCOUNT_SID")
        auth_token = os.getenv("TWILIO_AUTH_TOKEN")
        from_whatsapp_number = os.getenv("TWILIO_WHATSAPP_FROM", "whatsapp:+14155238886") # Default Twilio Sandbox
        to_whatsapp_number = os.getenv("TWILIO_WHATSAPP_TO")

        if not all([account_sid, auth_token, to_whatsapp_number]):
            print("Missing Twilio credentials in environment variables.")
            raise HTTPException(status_code=500, detail="Twilio configuration missing")

        client = Client(account_sid, auth_token)

        # Construct message
        body_text = f"📢 *Pecus Chain Alert*\n\n{request.message}"
        if request.timestamp:
            body_text += f"\n_Time: {request.timestamp}_"

        message = client.messages.create(
            from_=from_whatsapp_number,
            body=body_text,
            to=to_whatsapp_number
        )

        print(f"WhatsApp message sent. SID: {message.sid}")
        return {"status": "success", "sid": message.sid}

    except Exception as e:
        print(f"Failed to send WhatsApp message: {e}")
        raise HTTPException(status_code=500, detail=str(e))
