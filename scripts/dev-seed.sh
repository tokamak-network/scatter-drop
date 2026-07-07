#!/usr/bin/env bash
# dev-seed.sh — seed one demo campaign on the local fork so the frontend shows
# something immediately. Reads the addresses written by dev-fork.sh, verifies
# the operator + demo customer (dev-verify.sh), funds/approves, and createDrop's
# a 2-leaf campaign (customer = anvil #1, other = anvil #2). Leaf indices are
# assigned by ascending address — the same rule packages/merkle's buildDrop
# uses — so the on-chain root matches what a recipients CSV reconstructs
# through the frontend (wizard or ProofsPanel's post-hoc republish).
#
# Run after dev-fork.sh (same anvil still up). Prints the drop address and the
# customer's claim proof for in-browser claiming.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# Exported so the child dev-verify.sh inherits a custom RPC_URL.
export RPC_URL="${RPC_URL:-http://127.0.0.1:8545}"
CHAIN_ID="${FORK_CHAIN_ID:-31337}" # matches dev-fork.sh (fork relabelled off Sepolia)
DEPLOY_JSON="$ROOT/contracts/deployments/$CHAIN_ID.json"
[ -f "$DEPLOY_JSON" ] || { echo "ERROR: $DEPLOY_JSON not found — run dev-fork.sh first" >&2; exit 1; }

json_addr() { grep -o "\"$1\"[^,}]*" "$DEPLOY_JSON" | grep -oiE '0x[0-9a-f]{40}' | head -1; }
FACTORY="$(json_addr dropFactory)"
AIRDROP="$(json_addr airdropToken)"
# Fee is now charged in the airdrop token itself (no separate fee token).
if [ -z "$FACTORY" ] || [ -z "$AIRDROP" ]; then
  echo "ERROR: could not parse dropFactory/airdropToken from $DEPLOY_JSON" >&2
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
FEE="$(cast call "$FACTORY" 'feeOf(address,uint256)(uint256)' "$AIRDROP" "$TOTAL" --rpc-url "$RPC_URL" | awk '{print $1}')"
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

# Leaf index MUST be assigned by ascending address (packages/merkle's
# normalizeEntries/buildDrop rule), not a fixed customer=0/other=1 — a CSV
# reconstruction (the frontend wizard, or ProofsPanel's post-hoc republish)
# always rebuilds indices this way, so a hardcoded assignment that happens to
# disagree with address order produces an on-chain root no CSV can ever
# reproduce (the campaign becomes permanently unrecoverable).
CUSTOMER_LC="$(echo "$CUSTOMER" | tr '[:upper:]' '[:lower:]')"
OTHER_LC="$(echo "$OTHER" | tr '[:upper:]' '[:lower:]')"
if [[ "$CUSTOMER_LC" < "$OTHER_LC" ]]; then
  ADDR0="$CUSTOMER"; AMT0="$CUST_AMT"; CUSTOMER_IDX=0
  ADDR1="$OTHER";    AMT1="$OTHER_AMT"
else
  ADDR0="$OTHER";    AMT0="$OTHER_AMT"
  ADDR1="$CUSTOMER"; AMT1="$CUST_AMT";  CUSTOMER_IDX=1
fi
L0="$(cast keccak "$(pack 0 "$ADDR0" "$AMT0")")"
L1="$(cast keccak "$(pack 1 "$ADDR1" "$AMT1")")"
# sorted-pair root (OZ commutative)
if [[ "$L0" < "$L1" || "$L0" == "$L1" ]]; then
  ROOT_HASH="$(cast keccak "${L0}${L1#0x}")"
else
  ROOT_HASH="$(cast keccak "${L1}${L0#0x}")"
fi
# The customer's proof is just the sibling leaf in a 2-leaf tree.
if [ "$CUSTOMER_IDX" = "0" ]; then CUSTOMER_PROOF="$L1"; else CUSTOMER_PROOF="$L0"; fi

echo "[seed] verifying operator + customer on the fork..."
"$ROOT/scripts/dev-verify.sh" "$OPERATOR" >/dev/null
"$ROOT/scripts/dev-verify.sh" "$CUSTOMER" >/dev/null

echo "[seed] approving airdrop token (distribution + on-top fee)..."
# The fee is charged on top in the airdrop token, so approve TOTAL + FEE
# (python handles >2^63 arithmetic that bash $(( )) would overflow). Values are
# passed as argv (not interpolated into source) so an RPC-derived FEE can't
# inject code.
APPROVE="$(python3 -c 'import sys; print(int(sys.argv[1]) + int(sys.argv[2]))' "$TOTAL" "$FEE")"
cast send "$AIRDROP" 'approve(address,uint256)' "$FACTORY" "$APPROVE" --private-key "$OP_KEY" --rpc-url "$RPC_URL" >/dev/null

echo "[seed] createDrop..."
# Fee is charged on top in the airdrop token (approved above); no separate fee token.
# The airdrop token was allow-listed by DeployFork, so the token allow-list passes.
# startTime = NOW (claims open immediately); deadline = NOW + 7d (window >= MIN_DURATION).
cast send "$FACTORY" 'createDrop(uint8,address,bytes32,uint256,uint64,uint64,address)' \
  0 "$AIRDROP" "$ROOT_HASH" "$TOTAL" "$NOW" "$DEADLINE" "$REGISTRY" \
  --private-key "$OP_KEY" --rpc-url "$RPC_URL" >/dev/null

LEN="$(cast call "$FACTORY" 'dropsLength()(uint256)' --rpc-url "$RPC_URL" | awk '{print $1}')"
DROP="$(cast call "$FACTORY" 'dropAt(uint256)(address)' "$(( LEN - 1 ))" --rpc-url "$RPC_URL" | awk '{print $1}')"

echo "[seed] done."
echo "  drop          $DROP"
echo "  customer      $CUSTOMER  (index $CUSTOMER_IDX, amount $CUST_AMT)"
echo "  customer proof [$CUSTOMER_PROOF]"
echo "  claim in-browser: connect as customer, claim($CUSTOMER_IDX, customer, $CUST_AMT, [$CUSTOMER_PROOF])"
