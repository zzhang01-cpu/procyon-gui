@echo off
setlocal

set PORT=5000

echo ============================================
echo  Procyon GUI - Electron Development Mode
echo ============================================
echo.

echo [1/2] Starting Next.js dev server on port %PORT%...
start /b npx next dev -p %PORT%

echo Waiting for Next.js to be ready...
set READY=0
for /L %%i in (1,1,30) do (
    if !READY!==0 (
        timeout /t 2 /nobreak >nul 2>&1
        powershell -Command "try { $r = Invoke-WebRequest -Uri 'http://localhost:%PORT%' -UseBasicParsing -TimeoutSec 3; exit 0 } catch { exit 1 }" >nul 2>&1
        if !errorlevel!==0 (
            set READY=1
            echo Next.js is ready!
        ) else (
            echo Still waiting... %%i/30
        )
    )
)

if %READY%==0 (
    echo.
    echo WARNING: Next.js may not be ready yet, starting Electron anyway...
    echo If the app shows errors, wait a moment and reload.
)

echo.
echo [2/2] Starting Electron...
call npx electron . --dev

echo.
echo Electron closed.
endlocal
