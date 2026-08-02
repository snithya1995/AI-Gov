# 🚀 Setup and Run Guide - Rakfort AI Governance Platform

This guide explains how to configure, set up, and run the Rakfort AI Governance Platform from a fresh clone.

---

## 🛠️ Overview of Services

The platform consists of three main components:
1. **Frontend**: A React + Vite SPA (runs on port `5173`).
2. **Backend**: An Express.js Node API (runs on port `3001`).
3. **AI Agents**: A FastAPI Python agent service (runs on port `8000`).

---

## 🔑 Files to Create Before Running

All configuration is handled via `.env` files. Because `.env` files contain sensitive API credentials (such as Google API keys and Atlassian tokens), they are gitignored and **must not be committed to GitHub**.

To run the application, you must create **three `.env` files** based on the provided `.env.example` templates in their respective directories.

### 1️⃣ Frontend Config File (`frontend/.env`)
Create a file at `frontend/.env` and insert:
```env
VITE_BACKEND_URL=http://localhost:3001
VITE_API_URL=http://localhost:3001
VITE_AGENT_URL=http://localhost:8000
VITE_APP_NAME="AI Governance"
```

### 2️⃣ Backend Config File (`backend/.env`)
Create a file at `backend/.env` and insert (filling in your own secrets):
```env
# Development MongoDB (Local)
MONGODB_URI=mongodb://admin:password123@localhost:27017/governance_db?authSource=admin
REDIS_HOST=127.0.0.1
REDIS_PORT=6379

# Server Configuration
PORT=3001
NODE_ENV=development
CORS_ORIGIN=http://localhost:5173
JWT_SECRET=your_jwt_secret_key_at_least_32_characters
AGENT_URL=http://localhost:8000
FRONTEND_URL=http://localhost:5173
SESSION_SECRET=your_session_secret_key
```

### 3️⃣ Python Agents Config File (`backend/Agents/.env`)
Create a file at `backend/Agents/.env` and insert:
```env
GENAI_PROVIDER=gemini
GEMINI_CHAT_MODEL=gemini-2.5-flash
GEMINI_EMBED_MODEL=models/text-embedding-004

# Your Gemini API Key from Google AI Studio
GOOGLE_API_KEY=your_google_gemini_api_key_here

# Database
MONGODB_URI=mongodb://admin:password123@localhost:27017/governance_db?authSource=admin
MONGODB_DB=AI-Governance
MONGODB_UPLOADS_COL=rag_uploads
MONGODB_CHATS_COL=rag_chats

# Atlassian Integrations (Jira & Confluence syncing)
ATLASSIAN_URL=https://your-domain.atlassian.net
ATLASSIAN_EMAIL=your-atlassian-email@example.com
ATLASSIAN_API_TOKEN=your_atlassian_api_token
```

> [!WARNING]
> **Git Protection:** Double-check that all three `.env` files are ignored by checking your git status before committing. Never push raw API keys or passwords to GitHub.

> [!WARNING]
> **File Encoding:** These `.env` files must be saved as **UTF-8**, not UTF-16. If you create them on Windows via PowerShell redirection (e.g. `"..." > .env`), PowerShell defaults to UTF-16LE, which Vite/dotenv cannot parse — variables will silently fail to load. Use your editor's "Save As" with UTF-8 encoding, or `Set-Content -Encoding utf8` instead of `>`. Check with `file .env` (should say "ASCII text" or "UTF-8", not "UTF-16").

> [!NOTE]
> **Two separate databases are used.** The Node backend (`backend/.env`) connects to the `governance_db` database and owns assessment templates, users, projects, etc. The Python agent (`backend/Agents/.env`, `MONGODB_DB=AI-Governance`) connects to a **different** database, `AI-Governance`, used only for RAG uploads/chats and the imported risk/control libraries. Don't expect `npm run seed` output to show up under `AI-Governance`, or `import_libraries.py` output to show up under `governance_db` — they're intentionally separate.

---

## ⚡ Step-by-Step Installation

Follow these commands in your terminal to set up the dependencies:

### Step 1: Install Backend Node Dependencies
```bash
cd backend
npm install
```

### Step 2: Install Frontend Node Dependencies
```bash
cd ../frontend
npm install
```

### Step 3: Setup Python Agent Virtual Environment
```bash
cd ../backend/Agents
python -m venv .venv

# Activate the virtual environment:
# On Windows PowerShell:
.\.venv\Scripts\activate
# On macOS/Linux:
source .venv/bin/activate

# Install dependencies:
pip install -r requirements.txt
```

---

## 🗄️ Database Setup & Seeding

The application requires MongoDB and Redis to be running.

### 1. Start Services via Docker Compose
To run MongoDB and Redis easily, start them using the Docker Compose configuration inside the `backend/` directory. Make sure Docker Desktop is running first.

> [!NOTE]
> Modern Docker Desktop ships **Compose V2**, invoked as `docker compose` (a subcommand, no hyphen) rather than the older standalone `docker-compose` binary. If `docker-compose` isn't found on your machine, use the command below instead — it's equivalent.

```bash
cd backend
docker compose -f docker-compose.dev.yml up -d
```
*This starts both `mongodb` (port `27017`) and `redis` (port `6379`) containers.*

### 2. Seed Assessment Templates (Node Backend)
Ensure your backend dependencies are installed, then run the database seeding command inside the `backend/` directory:
```bash
cd backend
npm run seed
```
*This inserts the default AI System, Cybersecurity, and Third-party assessment questionnaire templates into your database.*

### 3. Seed Risk & Control Libraries (Python Agent)
With your Python virtual environment activated, run the excel importer script in the `backend/Agents/` directory:
```bash
cd backend/Agents
python import_libraries.py
```
*This imports predefined AI & Cyber risks/controls from local Excel templates directly into your MongoDB database.*

---

## 🏃 Running the Application (3 Terminals)

To start the platform, run the following commands in three separate terminal windows:

### Terminal 1: Express Backend
```bash
cd backend
npm run dev
```
*Runs on `http://localhost:3001`*

### Terminal 2: Python FastAPI Agent
```bash
cd backend/Agents
# Ensure venv is activated first (see Step 3 above), then:
python main.py
```
*Runs on `http://localhost:8000`*

### Terminal 3: Vite React Frontend
```bash
cd frontend
npm run dev
```
*Runs on `http://localhost:5173`*

---

## 👤 Creating the Demo User
Once the backend server is running in Terminal 1, run the one-time script in a separate terminal to create your admin demo user account:
```bash
cd backend
node createDemoUser.js
```
*Expected Output: `Status: 200` with the user registration info.*

You can now navigate to **`http://localhost:5173`** and log in using:
* **Email**: `demo@rakfort.com`
* **Password**: `governance.demo@Rakfort`

---

## 🌐 Verification Endpoints

Use these URLs to verify that all systems are healthy:

| Service | Endpoint URL | Expected Healthy Response |
| :--- | :--- | :--- |
| **Frontend** | `http://localhost:5173` | Renders Login Page |
| **Backend API** | `http://localhost:3001/` | `{"status":"running"}` or similar JSON |
| **Agent API** | `http://localhost:8000/health` | `{"status":"ok"}` or version JSON |
| **Library Sync Status** | `http://localhost:8000/agent/libraries/status` | JSON displaying imported risk/control counts > 0 |

---

## ⚙️ Troubleshooting

* **MongoDB Connection Issues**: Ensure Docker Desktop is actually running (not just installed) — `docker info` should succeed. Ensure ports are mapped correctly (`27017`). Check backend logs in Terminal 1.
* **`docker-compose: command not found`**: Use `docker compose` (space, no hyphen) instead — see the note in the Docker Compose step above.
* **Agent Library Counts 0**: Run `python import_libraries.py` in the `backend/Agents` directory to import the local excel libraries to MongoDB. Remember this seeds the separate `AI-Governance` database, not `governance_db`.
* **Inspecting MongoDB from the CLI**: Don't paste multi-line command blocks (e.g. `show dbs` + `use ...` + `show collections`) into an interactive `mongosh` session — it buffers them as one incomplete statement instead of running each line. Either type one line at a time, or use a single non-interactive call, e.g.:
  ```bash
  docker exec governance-mongodb-dev mongosh -u admin -p password123 --authenticationDatabase admin --quiet --eval "
  const gdb = db.getSiblingDB('governance_db');
  print(gdb.getCollectionNames());
  "
  ```
* **Login fails in the browser but the API works fine via curl**: Usually a stale frontend session — hard refresh (Cmd/Ctrl+Shift+R). Check the browser DevTools Network/Console tab for the actual `/auth/login` response before assuming it's a backend issue.
* **Vite build spawn permission errors**: If you encounter esbuild EPERM errors during frontend dev server launch on Windows, run your terminal as Administrator or verify Node permissions.
