#!/usr/bin/env bash
# dev-seed.sh — seed one demo campaign on the local fork so the frontend shows
# something immediately. Reads the addresses written by dev-fork.sh, verifies
# the operator + demo customer (dev-verify.sh), funds/approves, and createDrop's
# a 2-leaf campaign (customer = anvil #1, other = anvil #2).
#
# Run after dev-fork.sh (same anvil still up). Prints the drop address and the
# customer's claim proof for in-browser claiming.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# Exported so the child dev-verify.sh inherits a custom RPC_URL.
export RPC_URL="${RPC_URL:-http://127.0.0.1:8545}"
CHAIN_ID="${FORK_CHAIN_ID:-11155111}"
DEPLOY_JSON="$ROOT/contracts/deployments/$CHAIN_ID.json"
[ -f "$DEPLOY_JSON" ] || { echo "ERROR: $DEPLOY_JSON not found — run dev-fork.sh first" >&2; exit 1; }

json_addr() { grep -o "\"$1\"[^,}]*" "$DEPLOY_JSON" | grep -oiE '0x[0-9a-f]{40}' | head -1; }
FACTORY="$(json_addr dropFactory)"
FEE_TOKEN="$(json_addr feeToken)"
AIRDROP="$(json_addr airdropToken)"
if [ -z "$FACTORY" ] || [ -z "$FEE_TOKEN" ] || [ -z "$AIRDROP" ]; then
  echo "ERROR: could not parse dropFactory/feeToken/airdropToken from $DEPLOY_JSON" >&2
  exit 1
fi
REGISTRY="${SEPOLIA_IDENTITY_REGISTRY:-0x3cF6A96f1970053ffDf957074F988aD53D13ada3}"

# Anvil well-known accounts: #0 operator (deployer/funded), #1 customer, #2 other.
OP_KEY="0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
OPERATOR="0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"
CUSTOMER="0x70997970C51812dc3A010C7d01b50e0d17dc79C8"
OTHER="0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC"

CUST_AMT="1000000000000000000000" # 1000e18
OTHER_AMT="500000000000000000000"  # 500e18
TOTAL="1500000000000000000000"     # 1500e18
# cast call annotates values (e.g. "10000000000000000000 [1e19]") — keep field 1.
FEE="$(cast call "$FACTORY" 'feeOf(address,uint8)(uint256)' "$FEE_TOKEN" 0 --rpc-url "$RPC_URL" | awk '{print $1}')"
NOW="$(cast block latest --field timestamp --rpc-url "$RPC_URL" | awk '{print $1}')"
if ! [[ "$NOW" =~ ^[0-9]+$ ]]; then
  echo "ERROR: could not read current block timestamp from $RPC_URL" >&2
  exit 1
fi
DEADLINE="$(( NOW + 7 * 24 * 3600 ))"

# Build the 2-leaf tree: leaf = keccak256(abi.encodePacked(index, account, amount)).
# cast to-uint256 (printf %x overflows for >2^63 amounts); bash param expansion
# avoids subshells. No lowercasing needed — cast parses hex case-insensitively.
pack() {
  local idx acct amt
  idx="$(cast to-uint256 "$1")"
  amt="$(cast to-uint256 "$3")"
  acct="${2#0x}"
  echo "0x${idx#0x}${acct}${amt#0x}"
}
L0="$(cast keccak "$(pack 0 "$CUSTOMER" "$CUST_AMT")")"
L1="$(cast keccak "$(pack 1 "$OTHER" "$OTHER_AMT")")"
# sorted-pair root (OZ commutative)
if [[ "$L0" < "$L1" || "$L0" == "$L1" ]]; then
  ROOT_HASH="$(cast keccak "${L0}${L1#0x}")"
else
  ROOT_HASH="$(cast keccak "${L1}${L0#0x}")"
fi

echo "[seed] verifying operator + customer on the fork..."
"$ROOT/scripts/dev-verify.sh" "$OPERATOR" >/dev/null
"$ROOT/scripts/dev-verify.sh" "$CUSTOMER" >/dev/null

echo "[seed] approving fee + airdrop tokens..."
cast send "$FEE_TOKEN" 'approve(address,uint256)' "$FACTORY" "$FEE" --private-key "$OP_KEY" --rpc-url "$RPC_URL" >/dev/null
cast send "$AIRDROP" 'approve(address,uint256)' "$FACTORY" "$TOTAL" --private-key "$OP_KEY" --rpc-url "$RPC_URL" >/dev/null

echo "[seed] createDrop..."
# ERC20-fee path: the fee is paid in FEE_TOKEN (approved above), so send no ETH value.
# The airdrop token was registered OFFICIAL by DeployFork, so the token allow-list passes.
# startTime = NOW (claims open immediately); deadline = NOW + 7d (window >= MIN_DURATION).
cast send "$FACTORY" 'createDrop(uint8,address,bytes32,uint256,uint64,uint64,address,address)' \
  0 "$AIRDROP" "$ROOT_HASH" "$TOTAL" "$NOW" "$DEADLINE" "$REGISTRY" "$FEE_TOKEN" \
  --private-key "$OP_KEY" --rpc-url "$RPC_URL" >/dev/null

LEN="$(cast call "$FACTORY" 'dropsLength()(uint256)' --rpc-url "$RPC_URL" | awk '{print $1}')"
DROP="$(cast call "$FACTORY" 'dropAt(uint256)(address)' "$(( LEN - 1 ))" --rpc-url "$RPC_URL" | awk '{print $1}')"

echo "[seed] done."
echo "  drop          $DROP"
echo "  customer      $CUSTOMER  (index 0, amount $CUST_AMT)"
echo "  customer proof [$L1]"
echo "  claim in-browser: connect as customer, claim(0, customer, $CUST_AMT, [$L1])"
