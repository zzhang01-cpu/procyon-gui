@echo off
setlocal

echo Building Next.js application...
call pnpm build
if errorlevel 1 (
    echo Build failed!
    exit /b 1
)

echo Packaging Electron application...
call npx electron-builder --win --x64
if errorlevel 1 (
    echo Packaging failed!
    exit /b 1
)

echo Build complete! Check the dist/ directory for the installer.
endlocal
