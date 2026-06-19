@echo off
echo Building Next.js application...
call pnpm build
if %ERRORLEVEL% neq 0 exit /b 1

echo Packaging Electron application...
call npx electron-builder --win --x64
if %ERRORLEVEL% neq 0 exit /b 1

echo Build complete! Check the dist/ directory for the installer.
