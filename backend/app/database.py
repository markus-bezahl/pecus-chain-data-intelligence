import os
from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv(os.path.join(os.path.dirname(__file__), '../.env'))

url: str = os.environ.get("SUPABASE_URL", "")
key: str = os.environ.get("SUPABASE_KEY", "")

supabase: Client = create_client(url, key)

def get_supabase_client() -> Client:
    return supabase

def get_authenticated_supabase_client(token: str) -> Client:
    """
    Creates a Supabase client authenticated with the user's JWT token.
    This ensures that RLS policies are applied based on the user's identity.
    """
    client = create_client(url, key)
    client.postgrest.auth(token)
    return client
