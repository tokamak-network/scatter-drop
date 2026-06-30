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

echo "[1/3] Starting anvil (fork of Sepolia, chain-id $FORK_CHAIN_ID)..."
anvil --fork-url "$SEPOLIA_RPC_URL" --chain-id "$FORK_CHAIN_ID" \
  >"$LOG_DIR/anvil.log" 2>&1 &
ANVIL_PID=$!
trap 'kill "$ANVIL_PID" 2>/dev/null || true' EXIT

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

# Print copy-paste frontend env (apps/web/.env.local). Reads the addresses the
# deploy just wrote; the web app owns the file, so we only emit the lines.
DEPLOY_JSON="$ROOT/contracts/deployments/$FORK_CHAIN_ID.json"
# `|| true` so a missing key / head SIGPIPE doesn't trip set -e before `wait`.
json_addr() { grep -o "\"$1\"[^,}]*" "$DEPLOY_JSON" | grep -oiE '0x[0-9a-f]{40}' | head -n 1 || true; }
if [ -f "$DEPLOY_JSON" ]; then
  echo
  echo "Frontend env (copy into apps/web/.env.local):"
  # No leading whitespace — lines must paste cleanly into a dotenv file.
  echo "NEXT_PUBLIC_CHAIN_ID=$FORK_CHAIN_ID"
  echo "NEXT_PUBLIC_RPC_URL=$RPC_URL"
  echo "NEXT_PUBLIC_DROP_FACTORY=$(json_addr dropFactory)"
  echo "NEXT_PUBLIC_FEE_TOKEN=$(json_addr feeToken)"
  echo "NEXT_PUBLIC_AIRDROP_TOKEN=$(json_addr airdropToken)"
fi

echo "Done. anvil still running on $RPC_URL — Ctrl-C to stop."
wait "$ANVIL_PID"
