#!/usr/bin/env bash
# dev-fork.sh — stand up a local clickable env: an anvil Sepolia fork with the
# real zk-X509 registries, then deploy DropFactory and write
# contracts/deployments/<chainId>.json for the frontend/SDK.
#
# Usage:
#   scripts/dev-fork.sh            # starts anvil, deploys, keeps anvil running
#   FORK_CHAIN_ID=11155111 scripts/dev-fork.sh
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
FORK_CHAIN_ID="${FORK_CHAIN_ID:-11155111}"
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

echo "[3/3] Done. Addresses: contracts/deployments/$FORK_CHAIN_ID.json"
echo "  anvil still running on $RPC_URL — Ctrl-C to stop."
wait "$ANVIL_PID"
