#!/usr/bin/env bash
# Single-instance starter for Grok/Cursor: free port, then run companion.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
PORT="${VELES_MCP_PORT:-17321}"
# Optional fixed token for local IDE config. If unset, companion generates one at startup.
TOKEN="${VELES_MCP_TOKEN:-}"

# Kill whatever holds the bridge port (previous companion / stale Grok spawn)
if command -v lsof >/dev/null 2>&1; then
  PIDS="$(lsof -t -iTCP:"${PORT}" -sTCP:LISTEN 2>/dev/null || true)"
  if [[ -n "${PIDS}" ]]; then
    # shellcheck disable=SC2086
    kill ${PIDS} 2>/dev/null || true
    sleep 0.3
  fi
fi

if [[ -n "${TOKEN}" ]]; then
  exec node "${ROOT}/dist/index.js" --port "${PORT}" --token "${TOKEN}"
fi
exec node "${ROOT}/dist/index.js" --port "${PORT}"
