# W5 — Local deployment & anvil E2E (M3)

> Status: **active.** W3 (MerkleDrop) and W4 (DropFactory) are merged to `main`;
> `DeployLocal.s.sol` builds and simulates, and the create→claim→sweep flow is
> asserted in `test/E2E.t.sol`.

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

## Confirmed signatures (from W4 / PR#5)
```solidity
constructor(address initialOwner, IERC20 feeToken_, address operatorRegistry_,
            IRegistryFactoryLike zkFactory_, address treasury_)   // Ownable(initialOwner)
enum AirdropType { CSV, ONCHAIN_SNAPSHOT, ONCHAIN_GATED, SOCIAL } // CSV = 0
setFee(uint8,uint256) / setFeeToken(IERC20) / setOperatorRegistry(address)
setZkFactory(IRegistryFactoryLike) / setTreasury(address) / withdrawFees(address,uint256)
createDrop(uint8 airdropType, address airdropToken, bytes32 merkleRoot,
           uint256 totalAmount, uint64 deadline, address identityRegistry) -> address drop
MockRegistryFactory.setRegistry(address,bool) / isRegistry(address) -> bool
```
`DeployLocal.s.sol` is written against these and compiles on `main`; the
create→claim→sweep flow is asserted in `test/E2E.t.sol`.

## Open items (confirm with K0 before finalizing)
- Local zk-X509: keep mock-only for M3 (assumed), real integration deferred.
- Whether E2E assertions live in a Foundry test (`forge script` + `forge test`)
  vs a TS harness driving anvil through `packages/sdk`. Leaning: Foundry script
  for deploy + a TS E2E using the SDK (matches how the frontend will call).

## Sepolia fork E2E (W5b)
`test/fork/ForkE2E.t.sol` runs the full create→claim→sweep→withdraw flow against
the **real** zk-X509 deployment on a Sepolia fork:
- `isRegistry` is checked against the live `RegistryFactory`
  (`0x9e937dF6ac0E85979622519068412A518fa085d9`) for the users `IdentityRegistry`
  (`0x3cF6A96f1970053ffDf957074F988aD53D13ada3`) — a real on-chain read;
- `verifiedUntil` is overridden with `vm.mockCall` (a real zk proof on a fork is
  impractical), keeping the override independent of the registry's proxy layout.

Run it (RPC sourced from the gitignored `contracts/.env`):
```bash
source contracts/.env && forge test --root contracts \
  --match-path "test/fork/ForkE2E.t.sol" -vv
```
Without `SEPOLIA_RPC_URL` the tests skip, so the default `forge test` stays
hermetic and offline.

## One-command fork deploy (W5c)
`scripts/dev-fork.sh` stands up a clickable local env: it starts an anvil
**Sepolia fork**, deploys `DropFactory` (wired to the real zk-X509
`RegistryFactory` + users `IdentityRegistry`) plus fresh mintable fee/airdrop
`MockERC20`s via `script/DeployFork.s.sol`, and writes the addresses to
`contracts/deployments/<chainId>.json` for the frontend/SDK. anvil stays up.

```bash
scripts/dev-fork.sh        # SEPOLIA_RPC_URL sourced from contracts/.env
```

`deployments/<chainId>.json` is a runtime artifact (gitignored). Note: creating a
campaign from the deployed factory still requires the operator wallet to be
identity-verified on the real registry (gate 1) — seeding a demo campaign on the
fork needs a real proof or an `anvil_setStorageAt` override of `verifiedUntil`,
tracked as a follow-up.
