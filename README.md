## Project Structure

- **frontend/**: React + Vite application for the user dashboard.
- **backend/**: Python (FastAPI) backend for ML models and data processing.
- **local-agent/**: C# .NET service that connects to the local SQL Server and syncs data to the cloud.

## Prerequisites

- **Node.js** (v18+): For the frontend.
- **Python** (v3.10+): For the backend.
- **Git**: For version control.

---

## 🚀 Getting Started

### 1. Backend Setup (Python)

The backend handles ML predictions and complex data processing.

1. Navigate to the backend directory:
   ```bash
   cd backend
   ```

2. Create a virtual environment (optional but recommended):
   ```bash
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   ```

3. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

4. Create a `.env` file in `backend/` with your Supabase credentials:
   ```env
   SUPABASE_URL=your_supabase_url
   SUPABASE_KEY=your_supabase_service_role_key
   ```

5. Run the server:
   ```bash
   uvicorn app.main:app --reload
   ```

### 2. Frontend Setup (React)

The frontend provides the user interface for monitoring and analytics.

1. Navigate to the frontend directory:
   ```bash
   cd frontend
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Create a `.env` file in `frontend/` with your Supabase credentials:
   ```env
   VITE_SUPABASE_URL=your_supabase_url
   VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
   ```

4. Start the development server:
   ```bash
   npm run dev
   ```

   The app will be available at `http://localhost:5173`.

---

## 📝 Requirements

- **Backend**: See `backend/requirements.txt`
- **Frontend**: See `frontend_requirements.txt` or `frontend/package.json`
