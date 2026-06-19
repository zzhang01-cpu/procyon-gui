@echo off
set PORT=5000

echo Starting Next.js dev server on port 5000...
start "Next.js" cmd /c "pnpm dev"

echo Waiting for Next.js to be ready...
npx wait-on http://localhost:5000 --timeout 60000

if %ERRORLEVEL% neq 0 (
    echo Next.js failed to start!
    exit /b 1
)

echo Starting Electron...
set ELECTRON_DEV=1
npx electron . --dev

echo Done.
