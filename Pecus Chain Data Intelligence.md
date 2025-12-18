PECUS CHAIN SMART PLATFORM

1. Pecus Chain Data Sync Agent
The Pecus Chain Data Sync Agent is a lightweight, background middleware application designed to be installed on local milking farm computers ("Edge"). Its primary purpose is to extract milking session data from a local Microsoft SQL Server (DelPro) and securely upload it to a centralized Cloud Database for predictive analysis.
The agent operates autonomously, ensuring data consistency via a "Store & Forward" mechanism and handling intermittent network connectivity or system power cycles (restarts/stand-by) without manual intervention. The technology stack is:
Application Type: Windows Service (Daemon)
Framework: .NET 8 (LTS) or newer
Language: C#

Local Database Interface: Microsoft.Data.SqlClient (ADO.NET)
Cloud Interface: REST API (HTTPS) via HttpClient
Resilience Library: Polly (suggested for advanced Retry policies)
These are the core functional requirements:
Service Lifecycle & Power Management
Auto-Start: The application must be installed as a Windows Service, configured to start automatically with the Operating System (before user login).
Persistence: The service must survive system restarts.
Power State Handling:
The service must be capable of pausing operations seamlessly if the host computer enters Sleep/Hibernation mode.
Upon Resume (wake-up), the service must automatically re-establish network/database connections and trigger a synchronization cycle immediately or at the next scheduled interval.
Optional: Implementation of SetThreadExecutionState to prevent idle sleep during active data transmission.
Scheduling
Polling Interval: The agent will execute the synchronization routine once every 1 hour.
Timer Logic: Use of System.Threading.PeriodicTimer or BackgroundService to maintain the schedule efficiently without blocking threads.



Synchronization Logic ("LastID" Watermark)
To ensure data consistency and avoid duplicates, the Agent must use a Stateful Synchronization approach:
Handshake: At the start of every cycle, the Agent calls a Cloud API endpoint (e.g., GET /api/sync/status?farmId=XYZ) to retrieve the LastTransactionID successfully saved in the Cloud Database.
Extraction: The Agent queries the local MS SQL Server for records strictly greater than that ID:SQLSELECT * FROM MilkingSessions WHERE TransactionID > @LastCloudID
Upload:
If records are found: Serialize data to JSON and send to the Cloud via POST.
If no records found: Log "No new data" and sleep until the next hour.
To mitigate risks associated with unstable rural internet connectivity and prevent server-side memory saturation, the Local C# Agent must implement a pagination strategy (batching) when uploading data to the Cloud API. The agent must not attempt to upload the entire backlog of data in a single HTTP request.
Batch Size Limit: The agent shall limit the payload of each HTTP POST request to a configurable maximum number of records (defined as MAX_BATCH_SIZE, recommended default: 1,000 records).
Looping Logic: The synchronization cycle must implement a "While Loop" mechanism:
Retrieve the LastCloudID (Watermark) from the API.
Query the local SQL Server for the next batch of records (TOP 1000) where TransactionID > LastCloudID, ordering by TransactionID ASC.
Serialize and upload this batch.
If the upload is successful, immediately repeat the cycle (fetch the new LastCloudID or increment locally) until zero records are returned.


Timeout Handling: Each batch request must have a defined timeout appropriate for the payload size (e.g., 30 seconds) to fail fast and trigger the Retry Policy in case of network hanging.

Network Retry Mechanism
The Agent must implement a robust Retry Policy for the HTTP calls to handle unstable rural internet connections.
Strategy: Exponential Backoff.
Logic:
Attempt 1: Fail.
Wait 2 seconds -> Retry.
Wait 4 seconds -> Retry.
Wait 8 seconds -> Retry.

... up to a maximum limit (e.g., 5 attempts).
Fallback: If all retries fail, log the error locally and abort the current cycle. Data will be picked up in the next hourly cycle (since the LastTransactionID on the cloud won't have changed).


Local Database Unavailability
If the local MS SQL Server is unreachable (e.g., DelPro is updating or the service hasn't started yet after a reboot):
Catch the SqlException.
Log the error to a local file.
Do not crash the service.
Wait for the next scheduled interval.
Deployment Strategy
Packaging: Self-contained single-file executable (.exe) including the .NET Runtime (to avoid dependency on pre-installed frameworks).
Installation: Scriptable via PowerShell or Command Line (sc create) for remote installation via TeamViewer/AnyDesk.

Example Workflow Diagram (Logic Flow)
1 - Start (Timer triggers every 60 min)
2 - Check Network: Is Cloud API reachable?
No: -> Wait for retry -> Fail -> Stop & Wait next hour.
Yes: -> Step 3.
3 - Get Watermark: Request LastID from Cloud.
Response: LastID = 10500.

4 - Query Local DB: SELECT * FROM Data WHERE ID > 10500.


5 - Process Result:
Rows = 0: -> Log "Up to date" -> End.
Rows > 0: -> Serialize to JSON -> Step 6.
6 - Upload Data: POST /api/upload.
Success: -> Cloud updates its own LastID.
Fail: -> Trigger Retry Logic.
7 - End Cycle.

2. Cloud Database (Supabase)
The system relies on Supabase (managed PostgreSQL) as the Single Source of Truth (SSOT). It handles structured relational data (farms, cows) and high-volume time-series data (milking sessions).
Technology: PostgreSQL 15+ (via Supabase).
Role: Persistent storage, user authentication, and data isolation.
Data Schema Strategy:
tenants (Farms): Stores farm metadata and configuration.
animals: Registry of individual cows linked to a specific tenant.
milking_sessions: The core time-series table. Contains raw data from the edge (Conductivity, Yield, Blood, Flow Rate, Timestamp). Indexed by cow_id and timestamp for fast retrieval.
alerts: Stores AI-generated predictions and their status (New, Acknowledged, False Positive).
Security & Multi-tenancy:

Implementation of Row Level Security (RLS) policies to ensure strict data isolation. Farm A can never query Farm B's data.
Authentication handled via Supabase Auth (JWT Tokens).

3. Backend API & Orchestrator
The backend is a lightweight, high-performance RESTful API hosted on Render. It acts as the gateway between the Edge Agents, the Database, and the AI Engine.
Technology: Python 3.10+ using FastAPI.
Hosting: Render (Web Service).
Core Responsibilities:
Data Ingestion: Exposes a secure endpoint (POST /api/v1/ingest) to receive JSON payloads from Edge Agents.
Data Validation: Pydantic models ensure incoming data integrity before processing.
AI Orchestration: Triggers the AI inference engine immediately upon data receipt (Real-time processing).
Notification Dispatch: Manages logic for sending critical alerts (SMS/Push) via third-party providers (e.g., Twilio) when risk thresholds are breached.






4. Frontend Web Application
The user interface for farmers and veterinarians. It provides real-time visualization of herd health and management of alerts.
Technology: React (built with Vite).
Hosting: Render (Static Site).
Key Features:
Dashboard: High-level overview of herd status (e.g., "3 Cows at Risk today").
Cow Detail View: Interactive charts (using Recharts/ApexCharts) showing conductivity and yield trends over time.
Alert Management: Interface to "Acknowledge" or "Dismiss" AI alerts. This feedback loop is tagged in the database to retrain and improve the AI model in the future.
Connectivity: Fetches data from the Backend API via secure HTTPS requests.



User Interface & Visualization
Enhanced Linear Charting: Implementation of linear trend graphs overlaying the herd average for immediate performance comparison.
Backend & Data Operations
Risk Assessment Queries: Scheduled database queries to scan and identify animals exceeding risk thresholds.
Multi-Unit Data Ingestion: Scalability support to retrieve and aggregate data from additional milking units (e.g., Robot #3 Integration).

5. AI Inference Engine
Embedded directly within the Backend API service, the AI Engine is responsible for the predictive analysis of mastitis risk.
Technology: Python (Scikit-learn / Pandas / PyTorch).

Workflow:
Agent sends data.
Backend hydrates data with historical context (fetches last 7 days stats from Supabase).
Model runs inference in-memory.
If risk_score > threshold, an Alert record is created in the database.

