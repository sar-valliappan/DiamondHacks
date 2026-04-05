#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ── Verify .env exists ────────────────────────────────────────────────────────
if [ ! -f "$SCRIPT_DIR/backend/.env" ]; then
  echo "❌  backend/.env not found. Run ./setup.sh first."
  exit 1
fi

# Check GEMINI_API_KEY is set
source "$SCRIPT_DIR/backend/.env" 2>/dev/null || true
if [ -z "$GEMINI_API_KEY" ] || [ "$GEMINI_API_KEY" = "your_gemini_api_key_here" ]; then
  echo "⚠️   GEMINI_API_KEY is not set in backend/.env"
  echo "    The app will start but Gemini features will not work."
  echo ""
fi

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║   Navigator — Starting                   ║"
echo "╚══════════════════════════════════════════╝"
echo ""

# ── Cleanup on exit ────────────────────────────────────────────────────────────
trap 'echo ""; echo "Stopping Navigator..."; kill $(jobs -p) 2>/dev/null; exit' INT TERM

# ── Start backend ─────────────────────────────────────────────────────────────
echo "🐍  Starting backend on http://localhost:8000 ..."
cd "$SCRIPT_DIR/backend"
uv run uvicorn main:app --host 0.0.0.0 --port 8000 --reload &
BACKEND_PID=$!

# Give backend a moment to boot
sleep 2

# ── Start frontend ────────────────────────────────────────────────────────────
echo "⚛️   Starting frontend on http://localhost:5173 ..."
cd "$SCRIPT_DIR/frontend"
npm run dev &
FRONTEND_PID=$!

echo ""
echo "╔══════════════════════════════════════════════════╗"
echo "║   Navigator is running!                          ║"
echo "║                                                  ║"
echo "║   Open in Chrome:  http://localhost:5173         ║"
echo "║   API health:      http://localhost:8000/api/health ║"
echo "║                                                  ║"
echo "║   Press Ctrl+C to stop                           ║"
echo "╚══════════════════════════════════════════════════╝"
echo ""

wait
