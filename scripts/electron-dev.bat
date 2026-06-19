@echo off
set PORT=5000

echo Starting Next.js dev server on port %PORT%...
start "Next.js Dev" cmd /c "pnpm dev"

echo Waiting for Next.js to be ready...
:waitloop
curl -s -o nul -w "%%{http_code}" http://localhost:%PORT% 2>nul | findstr "200 302" >nul
if errorlevel 1 (
    timeout /t 2 /nobreak >nul
    goto waitloop
)
echo Next.js is ready!

echo Starting Electron...
npx electron . --dev

echo Electron closed. Stopping Next.js...
taskkill /fi "WINDOWTITLE eq Next.js Dev" /f >nul 2>&1
