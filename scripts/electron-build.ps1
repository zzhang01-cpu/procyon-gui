# Build the Next.js app and package it with Electron
$ErrorActionPreference = "Stop"

Write-Host "Building Next.js application..."
pnpm build
if ($LASTEXITCODE -ne 0) { exit 1 }

Write-Host "Packaging Electron application..."
npx electron-builder --win --x64
if ($LASTEXITCODE -ne 0) { exit 1 }

Write-Host "Build complete! Check the dist/ directory for the installer."
