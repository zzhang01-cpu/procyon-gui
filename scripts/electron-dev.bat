@echo off
set PORT=5000

echo Starting Next.js dev server on port %PORT%...
start /b pnpm dev

echo Waiting for Next.js to be ready...
timeout /t 15 /nobreak >nul

echo Starting Electron...
npx electron . --dev
