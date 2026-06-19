# Start Next.js dev server and then Electron
$env:PORT = "5000"

Write-Host "Starting Next.js dev server on port 5000..."
$nextProc = Start-Process -FilePath "pnpm" -ArgumentList "dev" -PassThru -NoNewWindow

Write-Host "Waiting for Next.js to be ready..."
npx wait-on http://localhost:5000 --timeout 60000

if ($LASTEXITCODE -ne 0) {
    Write-Host "Next.js failed to start!"
    Stop-Process -Id $nextProc.Id -Force -ErrorAction SilentlyContinue
    exit 1
}

Write-Host "Starting Electron..."
$env:ELECTRON_DEV = "1"
$electronProc = Start-Process -FilePath "npx" -ArgumentList "electron", ".", "--dev" -PassThru -NoNewWindow

Write-Host "Both processes running. Press Ctrl+C to stop."
Write-Host "Next.js PID: $($nextProc.Id), Electron PID: $($electronProc.Id)"

# Wait for Electron to exit
$electronProc.WaitForExit()

# Cleanup
Write-Host "Stopping Next.js..."
Stop-Process -Id $nextProc.Id -Force -ErrorAction SilentlyContinue
Write-Host "Done."
