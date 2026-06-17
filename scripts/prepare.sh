#!/bin/bash
set -Eeuo pipefail

COZE_WORKSPACE_PATH="${COZE_WORKSPACE_PATH:-$(pwd)}"

cd "${COZE_WORKSPACE_PATH}"

echo "Installing dependencies..."
# Skip Electron binary download in sandbox (not needed for web mode)
ELECTRON_SKIP_BINARY_DOWNLOAD=1 pnpm install --prefer-frozen-lockfile --prefer-offline --loglevel debug --reporter=append-only
if command -v coze > /dev/null 2>&1 && coze check-bins --help > /dev/null 2>&1; then
  coze check-bins --fix
fi
