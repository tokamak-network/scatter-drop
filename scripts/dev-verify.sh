#!/usr/bin/env bash
# dev-verify.sh — mark a wallet identity-verified on the local anvil fork so it
# passes the zk-X509 gate without a real proof. For browser click-testing: run
# this on the connected wallet (and the campaign operator) so claim/createDrop
# go through.
#
# It overrides `verifiedUntil[addr]` on the users IdentityRegistry via
# anvil_setStorageAt. The mapping base slot (11) was found by probing the live
# proxy on a fork (set keccak256(abi.encode(addr, i)) and read back
# verifiedUntil until it matched). Override with VERIFIED_UNTIL_SLOT if the
# registry is upgraded.
#
# Usage:
#   scripts/dev-verify.sh <address> [verifiedUntil-unix]   # default: never expires
#
# Env: RPC_URL (default http://127.0.0.1:8545),
#      SEPOLIA_IDENTITY_REGISTRY (default real users registry),
#      VERIFIED_UNTIL_SLOT (default 11).
set -euo pipefail

ADDR="${1:?usage: dev-verify.sh <address> [verifiedUntil-unix]}"
UNTIL="${2:-18446744073709551615}" # uint64 max — never expires

RPC_URL="${RPC_URL:-http://127.0.0.1:8545}"
REGISTRY="${SEPOLIA_IDENTITY_REGISTRY:-0x3cF6A96f1970053ffDf957074F988aD53D13ada3}"
VERIFIED_UNTIL_SLOT="${VERIFIED_UNTIL_SLOT:-11}"

slot="$(cast index address "$ADDR" "$VERIFIED_UNTIL_SLOT")"
value="$(cast to-uint256 "$UNTIL")"

cast rpc anvil_setStorageAt "$REGISTRY" "$slot" "$value" --rpc-url "$RPC_URL" >/dev/null
got="$(cast call "$REGISTRY" 'verifiedUntil(address)(uint64)' "$ADDR" --rpc-url "$RPC_URL")"
echo "verified $ADDR -> verifiedUntil=$got (registry $REGISTRY)"
