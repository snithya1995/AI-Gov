@echo off
title AI Governance Platform Setup and Runner
echo =======================================================================
echo           Rakfort AI Governance Platform Setup and Runner (Vertex AI)
echo =======================================================================
echo.

set PROJECT_ROOT=%~dp0
cd /d "%PROJECT_ROOT%"

:: --- 1. Environment Configurations Setup ---
echo [*] Checking Environment Configuration (.env files)...

if not exist "frontend\.env" (
    echo [!] frontend\.env is missing. Copying from env.example...
    copy "frontend\env.example" "frontend\.env" >nul
) else (
    echo [+] frontend\.env exists.
)

if not exist "backend\.env" (
    echo [!] backend\.env is missing. Copying from env.example...
    copy "backend\env.example" "backend\.env" >nul
) else (
    echo [+] backend\.env exists.
)

if not exist "backend\Agents\.env" (
    echo [!] backend\Agents\.env is missing. Copying from env.example...
    copy "backend\Agents\env.example" "backend\Agents\.env" >nul
    echo [!] Created backend\Agents\.env. Please ensure you configure:
    echo     GENAI_PROVIDER=vertexai
    echo     GOOGLE_CLOUD_PROJECT_ID=your_gcp_project_id
    echo     GOOGLE_APPLICATION_CREDENTIALS=your_service_account_json_path
) else (
    echo [+] backend\Agents\.env exists.
)
echo.

:: --- 2. Install Dependencies ---
echo =======================================================================
set /p INSTALL_DEPS="Do you want to install/update dependencies? (y/n): "
if /i "%INSTALL_DEPS%"=="y" (
    echo [*] Installing Node backend dependencies...
    cd /d "%PROJECT_ROOT%\backend"
    call npm install

    echo [*] Installing Node frontend dependencies...
    cd /d "%PROJECT_ROOT%\frontend"
    call npm install

    echo [*] Setting up Python virtual environment...
    cd /d "%PROJECT_ROOT%\backend\Agents"
    if not exist ".venv" (
        python -m venv .venv
    )
    echo [*] Installing Python agent dependencies...
    call .venv\Scripts\pip install -r requirements.txt
)
echo.

:: --- 3. Database Seeding Option ---
echo =======================================================================
set /p SEED_DB="Do you want to run database seeding (Templates, Libraries, Demo User)? (y/n): "
if /i "%SEED_DB%"=="y" (
    echo [*] Seeding backend templates...
    cd /d "%PROJECT_ROOT%\backend"
    call npm run seed

    echo [*] Seeding AI/Cyber Risks and Controls...
    cd /d "%PROJECT_ROOT%\backend\Agents"
    call .venv\Scripts\python import_libraries.py

    echo [*] Creating Admin Demo User...
    cd /d "%PROJECT_ROOT%\backend"
    call node createDemoUser.js
)
echo.

:: --- 4. Launch Services ---
echo =======================================================================
echo [*] Launching all 3 services in separate windows...
echo.

cd /d "%PROJECT_ROOT%"

:: Start Backend
echo Starting Express Backend on port 3001...
start "AI Governance - Express Backend" cmd /k "cd /d \"%PROJECT_ROOT%\backend\" && npm run dev"

:: Start Python Agent
echo Starting Python FastAPI Agent on port 8000...
start "AI Governance - Python Agent" cmd /k "cd /d \"%PROJECT_ROOT%\backend\Agents\" && .venv\Scripts\activate.bat && python main.py"

:: Start Frontend
echo Starting React Vite Frontend on port 5173...
start "AI Governance - React Frontend" cmd /k "cd /d \"%PROJECT_ROOT%\frontend\" && npm run dev"

echo.
echo =======================================================================
echo [SUCCESS] All services have been launched in separate terminal windows!
echo Please open: http://localhost:5173
echo =======================================================================
pause
