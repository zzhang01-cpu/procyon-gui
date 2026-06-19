@echo off
setlocal

set PORT=5000

echo Starting Next.js dev server on port %PORT%...
start /b npx next dev -p %PORT% > nul 2>&1

echo Waiting for Next.js to be ready...
:waitloop
timeout /t 2 /nobreak >nul
curl -s -o nul http://localhost:%PORT% 2>nul
if errorlevel 1 (
    echo Still waiting for Next.js...
    goto waitloop
)
echo Next.js is ready!

echo Starting Electron...
call npx electron . --dev

echo Electron closed.
endlocal
