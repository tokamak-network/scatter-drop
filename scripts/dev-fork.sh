#!/usr/bin/env bash
# dev-fork.sh — stand up a local clickable env: an anvil Sepolia fork with the
# real zk-X509 registries, then deploy DropFactory and write
# contracts/deployments/<chainId>.json for the frontend/SDK.
#
# Usage:
#   scripts/dev-fork.sh            # starts anvil, deploys, keeps anvil running
#   FORK_CHAIN_ID=1337 scripts/dev-fork.sh    # override the default 31337
#   (avoid 11155111 — it collides with real Sepolia, the issue this fixes)
#
# Requires SEPOLIA_RPC_URL in contracts/.env (gitignored). Modelled on
# scatter-dex/scripts/dev-fork.sh.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/contracts"

# Load secrets/addresses (SEPOLIA_RPC_URL, optional overrides).
set -a
# shellcheck disable=SC1091
[ -f .env ] && . .env
set +a
: "${SEPOLIA_RPC_URL:?set SEPOLIA_RPC_URL in contracts/.env}"

RPC_URL="http://127.0.0.1:8545"
# Default to anvil's 31337, NOT Sepolia's 11155111: the fork must be
# distinguishable from the real chain so a wallet can't silently send
# createDrop/approve to live Sepolia (it forks Sepolia *state*, so the real
# zk-X509 contracts are still present and chainid-independent).
FORK_CHAIN_ID="${FORK_CHAIN_ID:-31337}"
# Anvil account #0 — a publicly-known dev key, hardcoded on purpose. Not
# overridable: this helper only ever targets a local anvil fork, and accepting a
# key from the environment would risk leaking a real one into process args.
DEPLOYER_KEY="0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"

LOG_DIR="$ROOT/.dev-logs"
mkdir -p "$LOG_DIR"

# Reuse an anvil already listening on :8545 (so re-running this script doesn't
# fail on a busy port); otherwise start one DETACHED so it survives this script.
if cast block-number --rpc-url "$RPC_URL" >/dev/null 2>&1; then
  echo "[1/3] anvil already running on $RPC_URL — reusing it."
  ANVIL_PID=""
else
  echo "[1/3] Starting anvil (fork of Sepolia, chain-id $FORK_CHAIN_ID)..."
  # nohup + disown so anvil keeps running after this script exits (no Ctrl-C needed).
  nohup anvil --fork-url "$SEPOLIA_RPC_URL" --chain-id "$FORK_CHAIN_ID" \
    >"$LOG_DIR/anvil.log" 2>&1 &
  ANVIL_PID=$!
  disown "$ANVIL_PID" 2>/dev/null || true
  # Only kill the anvil WE started, and only if the deploy fails before finishing.
  trap '[ -n "$ANVIL_PID" ] && kill "$ANVIL_PID" 2>/dev/null || true' ERR

  for _ in {1..30}; do
    cast block-number --rpc-url "$RPC_URL" >/dev/null 2>&1 && break
    sleep 1
  done
  if ! cast block-number --rpc-url "$RPC_URL" >/dev/null 2>&1; then
    echo "  ERROR: anvil did not come up; last log:" >&2
    tail -n 20 "$LOG_DIR/anvil.log" >&2 || true
    exit 1
  fi
  echo "  anvil up on $RPC_URL (PID $ANVIL_PID)"
fi

echo "[2/3] Deploying DropFactory + tokens onto the fork..."
forge script script/DeployFork.s.sol:DeployFork \
  --rpc-url "$RPC_URL" --broadcast --private-key "$DEPLOYER_KEY"

echo "[3/4] Addresses: contracts/deployments/$FORK_CHAIN_ID.json"

if [ "${SEED_DEMO:-true}" != "false" ]; then
  echo "[4/4] Seeding a demo campaign (verify operator+customer, createDrop)..."
  RPC_URL="$RPC_URL" FORK_CHAIN_ID="$FORK_CHAIN_ID" "$ROOT/scripts/dev-seed.sh" \
    || echo "  (demo seed failed — non-fatal; SEED_DEMO=false to skip)"
else
  echo "[4/4] SEED_DEMO=false — skipping demo campaign."
fi

# Write apps/web/.env.local directly (and echo it) so you don't hand-copy
# addresses each run. The web app owns the file; we overwrite the NEXT_PUBLIC_*
# the deploy just produced. WEB_ENV=false to only print, not write.
DEPLOY_JSON="$ROOT/contracts/deployments/$FORK_CHAIN_ID.json"
WEB_ENV_FILE="$ROOT/apps/web/.env.local"
# `|| true` so a missing key / head SIGPIPE doesn't trip set -e before `wait`.
json_addr() { grep -o "\"$1\"[^,}]*" "$DEPLOY_JSON" | grep -oiE '0x[0-9a-f]{40}' | head -n 1 || true; }
if [ -f "$DEPLOY_JSON" ]; then
  ENV_BODY="NEXT_PUBLIC_CHAIN_ID=$FORK_CHAIN_ID
NEXT_PUBLIC_RPC_URL=$RPC_URL
NEXT_PUBLIC_DROP_FACTORY=$(json_addr dropFactory)
NEXT_PUBLIC_FEE_TOKEN=$(json_addr feeToken)
NEXT_PUBLIC_AIRDROP_TOKEN=$(json_addr airdropToken)"
  echo
  if [ "${WEB_ENV:-true}" = "true" ]; then
    printf '%s\n' "$ENV_BODY" > "$WEB_ENV_FILE"
    echo "✅ Wrote $WEB_ENV_FILE :"
  else
    echo "Frontend env (WEB_ENV=false — copy into apps/web/.env.local):"
  fi
  printf '%s\n' "$ENV_BODY"
fi

# Deploy + env write succeeded — don't let the ERR trap touch anvil anymore.
trap - ERR

echo
echo "✅ Done. anvil keeps running in the background on $RPC_URL (no Ctrl-C needed)."
echo "   Next, just start the frontend:"
echo "     pnpm --filter @scatter-drop/web dev      →  http://localhost:3000"
echo
echo "   To stop anvil later:  lsof -ti tcp:8545 | xargs kill"
