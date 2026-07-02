#!/usr/bin/env bash
# dev-down.sh — tear down the local test environment: the web dev server and the
# anvil Sepolia fork. Run this before re-forking with scripts/dev-fork.sh.
#
# The anvil fork is in-memory, so stopping it discards the deployed DropFactory
# and demo campaign (exactly what a clean re-fork needs). The SQLite dev DB and
# contracts/deployments/<chainId>.json are left alone — dev-fork.sh overwrites
# the json and `node apps/web/prisma/seed.mjs` refreshes the DB after re-forking.
#
# Usage:
#   scripts/dev-down.sh            # stop web (:3000) + anvil (:8545)
#   scripts/dev-down.sh --clean    # also remove .dev-logs
#   WEB_PORT=3001 ANVIL_PORT=8545 scripts/dev-down.sh   # override ports
#
# NOTE: no `set -e` — killing an already-dead process must not abort the script.
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WEB_PORT="${WEB_PORT:-3000}"
ANVIL_PORT="${ANVIL_PORT:-8545}"

# Stop whatever is listening on a port: TERM first, then KILL anything lingering.
kill_port() {
  local port="$1" label="$2" pids
  pids="$(lsof -ti "tcp:$port" 2>/dev/null || true)"
  if [ -z "$pids" ]; then
    echo "  $label (:$port) — not running"
    return
  fi
  echo "  $label (:$port) — stopping PID(s): $(echo "$pids" | tr '\n' ' ')"
  # shellcheck disable=SC2086
  kill $pids 2>/dev/null || true
  sleep 1
  pids="$(lsof -ti "tcp:$port" 2>/dev/null || true)"
  if [ -n "$pids" ]; then
    # shellcheck disable=SC2086
    kill -9 $pids 2>/dev/null || true
    echo "    force-killed lingering PID(s): $(echo "$pids" | tr '\n' ' ')"
  fi
}

echo "Tearing down the local test environment…"
kill_port "$WEB_PORT" "web dev server"
kill_port "$ANVIL_PORT" "anvil fork"

if [ "${1:-}" = "--clean" ] && [ -d "$ROOT/.dev-logs" ]; then
  rm -rf "$ROOT/.dev-logs"
  echo "  removed .dev-logs"
fi

echo "✅ Down. Re-fork with:  scripts/dev-fork.sh"
