#!/usr/bin/env bash
set -e

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║   Navigator — Setup                      ║"
echo "╚══════════════════════════════════════════╝"
echo ""

# ── 0. Check prerequisites ────────────────────────────────────────────────────
command -v uv >/dev/null 2>&1 || {
  echo "❌  uv is not installed."
  echo "    Install it with:  curl -LsSf https://astral.sh/uv/install.sh | sh"
  exit 1
}

command -v node >/dev/null 2>&1 || {
  echo "❌  Node.js is not installed."
  echo "    Install it from:  https://nodejs.org"
  exit 1
}

command -v npm >/dev/null 2>&1 || {
  echo "❌  npm is not installed. Please install Node.js."
  exit 1
}

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ── 1. Backend (Python / uv) ──────────────────────────────────────────────────
echo "📦  Installing Python dependencies with uv..."
cd "$SCRIPT_DIR/backend"

uv sync

echo "🎭  Installing Playwright browsers..."
.venv/bin/python -m playwright install chromium

# ── 2. .env file ──────────────────────────────────────────────────────────────
if [ ! -f "$SCRIPT_DIR/backend/.env" ]; then
  cp "$SCRIPT_DIR/.env.example" "$SCRIPT_DIR/backend/.env"
  echo ""
  echo "⚠️   Created backend/.env from .env.example"
  echo "    👉  Please open backend/.env and add your GEMINI_API_KEY before running."
  echo ""
else
  echo "✅  backend/.env already exists."
fi

# ── 3. Frontend (npm) ─────────────────────────────────────────────────────────
echo ""
echo "📦  Installing frontend dependencies with npm..."
cd "$SCRIPT_DIR/frontend"
npm install

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║   Setup complete!                        ║"
echo "║                                          ║"
echo "║   Next steps:                            ║"
echo "║   1. Add your GEMINI_API_KEY to          ║"
echo "║      backend/.env                        ║"
echo "║   2. Run:  ./run.sh                      ║"
echo "╚══════════════════════════════════════════╝"
echo ""
