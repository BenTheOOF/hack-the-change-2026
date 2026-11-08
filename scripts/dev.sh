#!/usr/bin/env bash
# Starts the API and the web app together. Stop both with Ctrl+C.
set -euo pipefail
cd "$(dirname "$0")/.."

[ -f .env ] || { echo "No .env found. Run: cp .env.example .env, then fill it in."; exit 1; }
set -a; . ./.env; set +a

(cd backend && uv sync)
[ -d frontend/node_modules ] || (cd frontend && npm ci)

trap 'trap - EXIT; kill 0' EXIT INT TERM
(cd backend && uv run uvicorn app.main:app --reload --port "${API_PORT:-8000}") &
cd frontend && PORT="${WEB_PORT:-3000}" npm run dev
