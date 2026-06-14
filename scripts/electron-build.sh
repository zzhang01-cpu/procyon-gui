#!/bin/bash
# Build the Next.js app and package it with Electron
set -e

echo "Building Next.js application..."
pnpm build

echo "Packaging Electron application..."
npx electron-builder --win --x64

echo "Build complete! Check the dist/ directory for the installer."
