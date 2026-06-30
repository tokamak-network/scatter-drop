# W5 — Local deployment & anvil E2E (M3)

> Status: **draft, pending W4 (DropFactory) merge to `main`.** The deploy script
> below is written against the frozen signatures from coordination (시임②); the
> `DropFactory` / `MockRegistryFactory` imports go live once W4 lands.

## Goal
Stand up the full scatter-drop stack on a local anvil node and run one end-to-end
campaign: operator creates a drop → an eligible, identity-verified customer
claims → operator sweeps the remainder after the deadline. zk-X509 is mocked
locally in M3 (real RegistryFactory / IdentityRegistry integration is later).

## Components deployed (local)
1. `MockERC20` — fee token **and** an airdrop token (mint to operator).
2. `MockIdentityRegistry` (operator gate) — the global `operatorRegistry`.
3. `MockIdentityRegistry` (customer gate) — the campaign `identityRegistry`.
4. `MockRegistryFactory` — `isRegistry(customerRegistry) == true` (W4 file).
5. `DropFactory` — wired with `feeToken`, `operatorRegistry`, `zkFactory`,
   `treasury`; per-type fees set via `setFee` (W4 file).

## E2E flow (script + SDK harness)
1. **Deploy** the components above (`DeployLocal.s.sol`).
2. **Verify identities**: `setVerifiedUntil(operator, far-future)` on the
   operator registry; `setVerifiedUntil(customer, far-future)` on the customer
   registry.
3. **Build the tree off-chain** with `packages/merkle` (`buildDrop`) over a small
   allocation set including `customer`; capture `merkleRoot` + `proofs`.
4. **createDrop**: operator approves the fee, calls
   `createDrop(type, airdropToken, merkleRoot, totalAmount, deadline, customerRegistry)`.
5. **claim**: customer calls `claim(index, account, amount, proof)` via the
   `packages/sdk` calldata builder; assert balance received + `isClaimed`.
6. **Negative checks**: unverified customer claim reverts (`NotVerified`);
   non-operator `createDrop` reverts (gate 1).
7. **sweep**: warp past `deadline`, operator sweeps the remainder to itself.

## Leaf-encoding parity
The off-chain tree (`packages/merkle`) and on-chain `MerkleDrop` share
`keccak256(abi.encodePacked(uint256 index, address account, uint256 amount))`
with sorted-pair hashing — already cross-checked by `MerkleDrop.t.sol`. The E2E
re-exercises it against a live chain.

## Open items (confirm with K0 before finalizing)
- Local zk-X509: keep mock-only for M3 (assumed), real integration deferred.
- Whether E2E assertions live in a Foundry test (`forge script` + `forge test`)
  vs a TS harness driving anvil through `packages/sdk`. Leaning: Foundry script
  for deploy + a TS E2E using the SDK (matches how the frontend will call).
