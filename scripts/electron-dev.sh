#!/bin/bash
# Start Next.js dev server and then Electron
export PORT=5000

echo "Starting Next.js dev server on port $PORT..."
pnpm dev &
NEXT_PID=$!

echo "Waiting for Next.js to be ready..."
npx wait-on http://localhost:$PORT --timeout 60000

echo "Starting Electron..."
npx electron . --dev &
ELECTRON_PID=$!

# Wait for either process to exit
wait -n $NEXT_PID $ELECTRON_PID 2>/dev/null

# Kill remaining processes
kill $NEXT_PID $ELECTRON_PID 2>/dev/null
