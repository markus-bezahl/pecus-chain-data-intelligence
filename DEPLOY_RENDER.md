# Guida al Deploy su Render (Backend + Frontend)

Questa guida ti accompagna passo dopo passo nella pubblicazione della tua applicazione su Render.

Il progetto è già configurato con un file `render.yaml` ("Blueprint") che permette a Render di capire automaticamente come costruire e avviare sia il Backend (Python) che il Frontend (React).

---

## 1. Preparazione

Assicurati di aver pushato tutto il codice aggiornato su GitHub:
```bash
git add .
git commit -m "Update render config"
git push origin main
```

---

## 2. Creazione del Blueprint su Render

1.  Vai su [dashboard.render.com](https://dashboard.render.com/).
2.  Clicca su **"New +"** in alto a destra e seleziona **"Blueprint"**.
3.  Collega il tuo account GitHub (se non lo hai già fatto) e seleziona il repository `pecus-chain-data-intelligence`.
4.  Render rileverà automaticamente il file `render.yaml` e ti mostrerà due servizi da creare:
    *   **pecus-backend**: Il servizio web Python.
    *   **pecus-frontend**: Il sito statico React.

---

## 3. Configurazione Variabili d'Ambiente

Durante la creazione del Blueprint (o subito dopo nelle impostazioni di ogni servizio), dovrai inserire le chiavi segrete che non sono nel codice.

### Per `pecus-backend` (Environment Variables)
Render ti chiederà di inserire i valori per:
*   `SUPABASE_URL`: Il tuo URL di Supabase.
*   `SUPABASE_KEY`: La tua chiave `service_role` (quella segreta per il backend).

### Per `pecus-frontend` (Environment Variables)
*   `VITE_SUPABASE_URL`: Il tuo URL di Supabase.
*   `VITE_SUPABASE_ANON_KEY`: La tua chiave `anon` (quella pubblica).
*   `VITE_API_URL`: L'URL del backend su Render (lo otterrai dopo il primo deploy, es. `https://pecus-backend.onrender.com`).
    *   *Nota*: Al primo deploy, puoi lasciare vuoto o mettere un placeholder, poi aggiornarlo e fare un redeploy.

---

## 4. Finalizzare il Deploy

1.  Clicca **"Apply"** o **"Create Blueprint"**.
2.  Render inizierà a costruire entrambi i servizi in parallelo.
3.  Attendi qualche minuto.
    *   Il **Frontend** sarà disponibile su un URL tipo `https://pecus-frontend.onrender.com`.
    *   Il **Backend** sarà su `https://pecus-backend.onrender.com`.

---

## 5. Aggiornamento Post-Deploy

Una volta che il backend è online:
1.  Copia l'URL del backend (es. `https://pecus-backend.onrender.com`).
2.  Vai nelle impostazioni del servizio **pecus-frontend** su Render -> **Environment**.
3.  Aggiungi/Aggiorna la variabile `VITE_API_BASE_URL` (o come l'hai chiamata nel codice frontend) con l'URL del backend.
4.  Vai nel codice del Backend (`main.py`) e assicurati di aggiornare il **CORS** per accettare il dominio del frontend Render:
    ```python
    allow_origins=[
        "http://localhost:5173",
        "https://pecus-frontend.onrender.com" # <--- Aggiungi il tuo URL reale qui
    ]
    ```
5.  Pusha la modifica del CORS su GitHub -> Render farà automaticamente il redeploy.

---

## Troubleshooting

*   **Build Frontend Fallita?** Controlla i log. Spesso è un problema di dipendenze. Assicurati che `npm run build` funzioni in locale.
*   **Backend non parte?** Controlla i log su Render. Verifica che `requirements.txt` sia aggiornato e che `uvicorn` riesca a trovare `app.main:app`.
*   **Errori CORS?** Se il frontend non riesce a chiamare il backend, è quasi sempre perché non hai aggiunto l'URL del frontend alla lista `allow_origins` nel `main.py`.
