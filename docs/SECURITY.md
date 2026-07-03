# scatter-drop — Security Summary (M2 contracts)

Audience: external auditors and reviewers. Scope: the v1 on-chain core
(`contracts/src/DropFactory.sol`, `contracts/src/MerkleDrop.sol`) and its
read-only dependency on the zk-X509 identity contracts. This document summarizes
the W13 internal security pass, the trust/threat model, resolved findings, and an
external-audit checklist. **§7 packages the post-W13 delta** (native-ETH airdrops
and on-chain proofs CID) so a re-review can focus on the changed surface only.

Commit references are the merge commits on `main` at the time of writing.

## 1. System overview

`DropFactory` is a self-service factory for compliant, identity-gated Merkle
airdrops. Each `createDrop` deploys a `MerkleDrop` campaign, charges a per-type
creation fee into a vault, and funds the campaign with the airdrop tokens.

```
DropFactory.createDrop ──deploys──▶ MerkleDrop (one per campaign)
        │                                  │
   gate 1: operatorRegistry           gate 2: identityRegistry
   (creator verified)                 (claimer verified, self-claim)
        │
   fee vault (collectedFees) ──withdrawFees──▶ fixed treasury
```

Two identity gates, both backed by zk-X509:

| Gate | Subject | Registry | Enforced at |
| ---- | ------- | -------- | ----------- |
| 1 (operator) | campaign creator wallet | global `operatorRegistry` | `DropFactory.createDrop` |
| 2 (customer) | claimer wallet | per-campaign `identityRegistry` | `MerkleDrop.claim` |

### Identity dependency (read-only, external)

```solidity
interface IIdentityRegistry  { function verifiedUntil(address) external view returns (uint64); }
interface IRegistryFactoryLike { function isRegistry(address) external view returns (bool); }
```

`verifiedUntil(addr) >= block.timestamp` means the wallet is currently verified.
`isRegistry(addr)` confirms a customer registry was issued by the canonical
zk-X509 RegistryFactory. Both are `view` (STATICCALL) and treated as trusted,
non-reentrant dependencies; the contracts are pure consumers and never modify
zk-X509 state.

## 2. Trust model & assumptions

| Actor | Trust | Powers / constraints |
| ----- | ----- | -------------------- |
| **Owner (admin)** | Trusted | Sets fees, fee token, operator registry, zk factory, treasury; withdraws fees **only to the fixed `treasury`** (no arbitrary recipient). Cannot touch deployed campaigns' funds. |
| **Operator (creator)** | Semi-trusted; must pass gate 1 | Chooses `airdropToken`, `merkleRoot`, `totalAmount`, the claim window (`startTime`/`deadline`), customer registry, and fee token. Can `sweep` **only their own** campaign's leftovers, and only after `deadline`. |
| **Claimer** | Untrusted; must pass gate 2 | Self-claim only (`account == msg.sender`); each leaf claimable once. |
| **zk-X509 (RegistryFactory / IdentityRegistry)** | Trusted external | Read-only (`isRegistry`, `verifiedUntil`), `view`/STATICCALL — cannot reenter. |
| **ERC20 tokens** | Untrusted input | Standard, non-rebasing, non-fee-on-transfer ERC20 is **expected**. Fee-on-transfer (and any non-exact transfer) is **rejected at creation** by the exact-receipt guard; standard rebasing tokens pass at creation and are **unsupported** (a later global rebase can under/over-fund a live campaign — out of scope). Configured registries/tokens must be contracts (`NotAContract`). |

Key invariants:
- **Vault conservation:** `collectedFees[token] == Σ fees accrued − Σ fees withdrawn`, and the vault's real balance never under-runs accounting (enforced by exact-receipt). Test: `test_vaultConservation_overManyOps`.
- **Fixed-treasury withdrawal:** fees can only ever leave to `treasury` (structural — `withdrawFees` has no recipient parameter).
- **One-claim-per-leaf:** a `BitMaps` bitmap keyed by leaf index; `_claimed.set` precedes the token transfer (CEI).
- **Self-claim:** the verified principal is always the recipient (`account == msg.sender`, `safeTransfer(msg.sender, …)`).

## 3. Leaf encoding (must match the off-chain library)

```
leaf = keccak256(abi.encodePacked(uint256 index, address account, uint256 amount))
```

Internal nodes use OpenZeppelin `MerkleProof` commutative (sorted-pair) hashing,
so proofs carry no sibling-position metadata. The three leaf fields are
fixed-width (32 + 20 + 32 bytes), so `abi.encodePacked` is unambiguous. This is
byte-for-byte identical to `packages/merkle` (`src/merkle.ts`), pinned by tests.
Leaf-vs-internal-node confusion is infeasible: leaves preimage 84 bytes vs 64 for
nodes, and `claim` derives the leaf from `(index, account, amount)` rather than
accepting a raw leaf.

## 4. W13 audit findings

Two independent adversarial audits of `DropFactory` + `MerkleDrop` (plus the
cross-contract funding/claim flow). **No Critical or High severity issues.** All
findings below are resolved or accepted with rationale.

| ID | Severity | Area | Finding | Resolution |
| -- | -------- | ---- | ------- | ---------- |
| M-1 | Medium | Funding (DropFactory) | A fee-on-transfer `airdropToken` delivers less than `totalAmount` to the drop while the Merkle leaves commit to the full amount → later claimers DoS'd. | **Fixed (fee-on-transfer)** — `_pullExact` requires the recipient to net exactly the requested amount at funding time, else revert `IncorrectAmountReceived`. PR #7 (`7ae90c75`). Standard rebasing tokens transfer exactly and pass this check; they are unsupported / out of scope (see §2). |
| #1 | Low | Fee vault (DropFactory) | A fee-on-transfer `feeToken` over-credits `collectedFees` vs. the real balance, stranding a slice of fees. | **Fixed** — same `_pullExact` guard on the fee pull; CEI preserved (`collectedFees` credited before the external pull). PR #7 (`7ae90c75`). |
| L-1 | Low | `claim` ordering (MerkleDrop) | The external `identityRegistry.verifiedUntil` call precedes `_claimed.set(index)`. | **Accepted (with rationale)** — the call order is unchanged: `verifiedUntil` is `view` (STATICCALL) so it cannot reenter or write state, and the value-moving `token.safeTransfer` still follows CEI (`_claimed.set` before transfer), so a double-claim is not reachable. PR #9 (`7fdfef9b`) documented this rationale and added a standalone-deploy token guard. |
| L-2 | Low | Claim window (DropFactory) | An operator could publish a near-instant campaign (a tiny claim window) and `sweep` almost immediately, misleading would-be claimers. | **Fixed** — `MIN_DURATION = 1 hours` is enforced on the *effective* claim window: `createDrop` requires `deadline > now`, `startTime < deadline`, and `deadline - max(startTime, now) >= MIN_DURATION`. Claimers always get at least `MIN_DURATION` of open claiming, regardless of a past or future `startTime`. Initial fix PR #10 (`94a77101`); generalized to the `startTime`/`deadline` window in W20 PR #29 (`3df6cab`). |
| I-1 | Info | Standalone deploy (MerkleDrop) | Direct (non-factory) deployment did not require the token to be a contract. | **Fixed** — constructor token code check added. PR #9 (`7fdfef9b`). (Factory path was already guarded by `DropFactory._requireContract`.) |
| I-2 | Info | Enumeration (DropFactory) | `_drops` is unbounded; `allDrops()` could exceed the gas limit for on-chain consumers. | **Accepted** — `allDrops()` is a view; paginated `dropsLength()` / `dropAt()` are provided for on-chain/large use. |
| I-3 | Info | Admin fee front-running | `setFee` can change the fee an operator pays within the same block; the frozen `createDrop` ABI cannot take a `maxFee` slippage bound. | **Accepted** — owner is trusted; integrators should approve exact per-campaign amounts rather than unlimited. |

### Full-stack security audit (post-W19/W20)

| ID | Severity | Area | Finding | Resolution |
| -- | -------- | ---- | ------- | ---------- |
| M-2 | Medium | Fee bypass (DropFactory) | After multi-token fees (W19), the ETH fee path (`feeToken == address(0)`) lacked the `FeeNotConfigured` guard the ERC20 path has. If `feeOf[ETH][type]` was unset (`0`), an operator could pass `feeToken = address(0)`, `msg.value = 0` and create a campaign **for free**, bypassing the configured ERC20 price for that airdrop type. | **Fixed** — the ETH branch now reverts `FeeNotConfigured` when the tier is unpriced, symmetric with ERC20: an unpriced tier is *not* a free tier. PR #40 (`2f8a1625`). |
| I-4 | Info | Permissionless registry spam (DropFactory) | `addAllowedToken` is permissionless (gated only by operator verification), so verified operators can register arbitrary `COMMUNITY` tokens, polluting the allow-list with spam/malicious entries. | **Accepted risk** — no fund loss (registration only marks a tier; `createDrop` still enforces all gates and exact-receipt). Mitigated operationally: the admin can `removeAllowedToken` and curate `OFFICIAL` tokens surfaced first. |

### Verified-safe (no action)

- Reentrancy: `createDrop` and `withdrawFees` follow CEI; a hooked fee/airdrop
  token re-entering `createDrop` only creates an independent, fully-paid
  campaign; `withdrawFees` is owner-only and decrements before transfer.
- Access control: all setters and `withdrawFees` are `onlyOwner` (OpenZeppelin
  `Ownable`); `sweep` is operator-only and post-deadline.
- Fee accounting is keyed per token, so fees of one token can never be withdrawn
  against another and stale accruals survive `setFeeToken` changes.
- Identity gate boundaries (`verifiedUntil >= now`) and claim-window boundaries
  (`claim` open on `[startTime, deadline]` — `ClaimNotStarted` before `startTime`,
  `ClaimClosed` after `deadline`; `sweep` allowed `> deadline`) are consistent with
  no overlap or gap.

## 5. Test coverage

`forge coverage` on `contracts/src/`:

| File | Lines | Statements | Branches | Functions |
| ---- | ----- | ---------- | -------- | --------- |
| `DropFactory.sol` | 100% | 100% | 100% | 100% |
| `MerkleDrop.sol` | 100% | 100% | 100% | 100% |

Coverage to 100% for `DropFactory` landed in PR #12 (`0d9e5a3f`). Suites include
gate pass/fail and boundary cases, registry validation, input validation,
contract-address guards, per-type fee accrual, fee-on-transfer rejection,
fixed-treasury withdrawal, fuzz (fee/amount accrual), and a vault-conservation
multi-op test. Deployment scripts and test mocks are intentionally not coverage
targets.

The post-W13 delta (§7) adds: `NativeDrop.t.sol` (native funding/claim/sweep/
withdraw), `NativeHardening.t.sol` (adversarial reentrancy pinned to the guard
selector, `receive()` guard, ETH conservation, gas), `invariant/NativeDropInvariant.t.sol`
(stateful ETH-conservation + fee-vault invariants), `ProofsPublished.t.sol`
(`publishProofs` access control / provenance / re-publish), and `GasSnapshot.t.sol`
(the §7.3 regression table).

## 6. External-audit checklist

- [ ] Re-confirm leaf encoding parity between `MerkleDrop.claim` and
      `packages/merkle` (cross-test on real campaign vectors).
- [ ] Review the exact-receipt assumption: the contracts reject fee-on-transfer
      / non-exact-transfer tokens at creation, but standard rebasing tokens pass
      the creation check and are unsupported (out of scope) — confirm the
      platform's supported token set is standard, non-rebasing ERC20.
- [ ] Validate the zk-X509 trust boundary: `isRegistry` / `verifiedUntil`
      semantics, registry revocation/expiry handling, and the assumption that
      blessed registries are non-malicious.
- [ ] Confirm admin-key custody/operational model for `owner` (fee, registry,
      treasury control) — consider a timelock/multisig for mainnet.
- [ ] Re-run `forge test` and `forge coverage`; review fuzz/invariant depth.
- [ ] Consider the `setFee` front-running surface (I-3) for the production fee
      policy (timelock or per-call bound).
- [ ] **Native-ETH path (§7.1):** confirm the `msg.value == totalAmount + fee`
      accounting, CEI + `nonReentrant` on `claim`/`sweep`, the `receive()`
      accept-only-if-native guard, and `collectedFees[NATIVE] == factory ETH
      balance`. Note the CLAIM_SAME test-sensitivity finding (assert the guard
      selector, not just "reverted").
- [ ] **`publishProofs` (§7.2):** confirm operator-only provenance via the
      immutable `factory` field, event-only (no storage), and that the spoofable
      self-address case is inert for indexers keyed by real drop addresses.

## 7. Post-W13 delta — re-review scope

The core changed after the W13 pass in **two batches**. Batch 1 (§7.1–7.2, merged
2026-07-01) is additive: native-ETH airdrops and the on-chain proofs CID. Batch 2
(§7.5, merged 2026-07-02) is **structural**: the factory became a UUPS proxy with
clone-per-campaign drops, gained an owner pause, a one-transaction
`approveAndCall → onApprove` create path, and reentrancy/ERC165 hardening. Fee
accounting, gates, exact-receipt guard, `MIN_DURATION`, leaf encoding, and the
fixed-treasury withdrawal invariant remain unchanged throughout; §7.4 gives the
consolidated scope.

### 7.1 Native-ETH airdrops (#55 support `b283a21`, #56 hardening `23a411b`)

Distributes native ETH as the airdrop asset, selected by the sentinel
`airdropToken == NATIVE` (`0xEeee…EEeE`, matching `MerkleDrop.NATIVE`).

- **`createDrop` (payable):** for `NATIVE`, `msg.value == totalAmount + fee`
  (`IncorrectValue` otherwise); ERC20 drops must send **no** ETH. The fee is
  credited to `collectedFees[NATIVE]` **before** the ETH is forwarded to the drop
  (CEI); the drop is funded with `totalAmount` via `SafeTransferLib.safeTransferETH`.
- **`MerkleDrop` native path:** immutable `isNative` flag; `claim`/`sweep` pay ETH
  via `safeTransferETH`. `claim` keeps CEI (`_claimed.set(index)` before the
  transfer) and both `claim` and `sweep` are `nonReentrant`.
- **`receive()`:** accepts ETH **only** for native drops (that is how the factory
  funds them); ERC20 drops revert `EthNotAccepted`, so ETH can't get stuck.
- **ETH fee vault:** `withdrawFees` sends `collectedFees[NATIVE]` to the fixed
  `treasury` via `safeTransferETH`, decrementing before the transfer.

**Audit focus points**

- *Reentrancy.* A malicious ETH receiver reenters `claim` (same leaf and a sibling
  leaf) and `sweep` from its `receive`; every attempt is pinned to OpenZeppelin's
  `ReentrancyGuardReentrantCall` selector. Mutation-verified: removing `nonReentrant`
  fails all three. ⚠️ **CLAIM_SAME false-confidence finding** — a bare `catch{}`
  passed even without the guard (CEI's `AlreadyClaimed` fires first); the tests now
  assert the *guard* selector so they stay sensitive to guard removal.
- *ETH transfer.* `safeTransferETH` reverts on a failed send, so a claim to a
  rejecting recipient reverts (no silent loss); no push-payment griefing beyond the
  caller's own claim.
- *Conservation.* Stateful invariant (claim/sweep/warp handler, ~128k calls, 0
  reverts): `claimed + swept + remaining == funded total` and
  `collectedFees[NATIVE] == factory ETH balance`.
- *Files.* `MerkleDrop.sol` (`isNative`, `receive`, `claim`, `sweep`),
  `DropFactory.sol` (`createDrop` native branch, `withdrawFees` NATIVE branch).
  Tests: `NativeDrop.t.sol`, `NativeHardening.t.sol`, `invariant/NativeDropInvariant.t.sol`.

### 7.2 On-chain proofs CID (#62 `publishProofs` `97a23ba`)

Lets a drop's operator record the IPFS CID of its `proofs.json` on-chain so
claimers can locate inclusion proofs without a trusted server.

- **`publishProofs(address drop, string cid)`** — **event-only** (`ProofsPublished(drop, cid)`),
  no storage. Latest event for a `drop` is its current CID; re-publishing is allowed.
- **Guards (cheapest-first):** non-empty `cid` (`EmptyCid`); `drop` has code and
  `MerkleDrop(drop).factory() == address(this)` — read via `try/catch` so a non-drop
  contract yields a clean `UnknownDrop`, not an opaque decode revert; caller must be
  `MerkleDrop(drop).operator()` (`NotDropOperator`).

**Audit focus points**

- *Access control.* Operator-only, per drop. Provenance is reconstructed from
  `MerkleDrop`'s **immutable** `factory` field — no `isDrop` mapping, no O(n) scan.
- *Trust model.* The guards prove the target *reports* this factory as deployer and
  `msg.sender` as its operator (authoritative immutables for a genuine drop). A
  contrived contract can spoof those values only about **itself**; it cannot make a
  real drop's `operator()` return a non-operator, so no one can publish a CID under
  another party's real drop, and indexers key events by known drop addresses (a
  spoofed self-address is inert noise).
- *Surface.* No value transfer and no storage write → no reentrancy or fund surface.
  Pure addition: `createDrop` and all prior state/paths are untouched.
- *Files.* `DropFactory.sol` (`publishProofs`, `ProofsPublished`, `UnknownDrop` /
  `NotDropOperator` / `EmptyCid`). Test: `ProofsPublished.t.sol`.

### 7.3 Gas snapshot (regression baseline)

Outer-call gas from `contracts/test/GasSnapshot.t.sol`. Each op is measured in its
own transaction (a fresh `setUp`) so cross-op EIP-2929 warm-access doesn't skew the
ERC20-vs-native comparison. Single-leaf tree, empty proof; `optimizer_runs = 200`.
Indicative, not a guarantee. **Re-measured on the batch-2 clone architecture**
(§7.5): `createDrop` fell ~70% (EIP-1167 clone instead of full `MerkleDrop`
deployment); per-op costs rose (clone-args calldata reads on every drop call, and
pull-to-factory two-leg ERC20 funding).

| Operation | ERC20 | Native ETH | Note |
| --------- | ----: | ---------: | ---- |
| `createDrop` (deploys a clone) | 257,707 | 219,765 | was 848k/806k pre-clones; native cheaper — no ERC20 pulls |
| `claim` | 77,737 | 81,954 | native +~4.2k: `safeTransferETH` low-level call |
| `sweep` | 52,574 | 57,862 | native +~5.3k: ETH send vs ERC20 transfer |
| `publishProofs` (event-only) | 11,140 | — | no value transfer, no storage write |

### 7.4 Re-review scope vs. W13 (consolidated, both batches)

- **New:** `DropFactory.publishProofs` (+ `ProofsPublished`, 3 errors);
  `onApprove` one-tx create (+ `DropParams`, `encodeDropParams`);
  `supportsInterface` (ERC165); `setApproveAndCallSupport` capability flag;
  `setPaused` owner pause; `initialize` (UUPS proxy setup).
- **Changed:** `DropFactory.createDrop` (payable + NATIVE funding; now routes
  through shared `_createDrop` with pull-to-factory ERC20 funding; `nonReentrant`),
  `DropFactory.withdrawFees` (NATIVE branch), `MerkleDrop` constructor / `claim` /
  `sweep` / `receive` (native branch), drop deployment (EIP-1167
  clone-with-immutable-args instead of `new MerkleDrop`).
- **Unchanged:** fee accounting & vault conservation, allow-list, gates 1/2,
  exact-receipt, `MIN_DURATION`, leaf encoding, fixed-treasury withdrawal.

### 7.5 Batch 2 — proxy architecture + TON one-tx path (2026-07-02, #67 #69 #72 #73 #75)

**UUPS factory + clone-per-campaign drops (#67).** The factory is deployed behind
an ERC1967 proxy (`Initializable` + Solady `UUPSUpgradeable`); campaigns are
EIP-1167 clone-with-immutable-args copies of a single `MerkleDrop` logic contract
(Solady `LibClone.clone(impl, args)` — per-drop config is baked into clone
bytecode, read back via `LibClone.argsOnClone`, so drops stay non-upgradeable and
immutable).
The constructor locks the implementation (`_disableInitializers`-equivalent);
`initialize` is `initializer`-guarded and sets registries, treasury, owner, and
the default fee. An owner `setPaused` blocks **new** campaign creation only —
existing drops are independent clones and keep working.

**One-tx create for `approveAndCall` tokens (#69, ERC165 in #75).** Tokamak TON
(SeigToken) restricts `transferFrom` to calls where the caller is `from`/`to`, and
its `approveAndCall` ERC165-checks the spender before invoking `onApprove`:

- `onApprove(owner, spender, amount, data)` — caller is the **token** (trusted
  only insofar as it's allow-listed; re-checked in `_createDrop`), `spender` must
  be this factory, `data` is `abi.encode(DropParams)`, and `amount` must equal
  `totalAmount + fee` exactly (`IncorrectValue`).
- ERC20 funding is **pull-to-factory then push-to-drop** (both legs
  exact-receipt guarded), which is what makes restricted-`transferFrom` tokens
  work; this replaced the direct operator→drop pull for *all* ERC20 drops.
- `supportsInterface` answers `0x4273ca16` (`onApprove`) + ERC165; without it the
  real TON reverts before `onApprove` and the one-tx path is unreachable.
- `setApproveAndCallSupport(token, bool)` is an owner-curated capability flag the
  frontend reads (`AacSupportSet` event) — advisory only, no funding-path effect.

**Reentrancy (#73).** `createDrop` and `onApprove` are `nonReentrant`
(factory-level guard, complementing the drop-level guards on `claim`/`sweep`);
`OnApprove.t.sol` pins the guard selector on both paths, mutation-verified like
§7.1.

**Audit focus points**

- *Upgradeability.* `_authorizeUpgrade` is owner-only; `initialize` cannot be
  re-run (re-initialization guard test) and the implementation is locked. Storage
  layout: `paused` and later vars are appended slots (no reordering) — verify
  layout compatibility on any future upgrade.
- *Clone args integrity.* Per-drop immutable args are read back with
  `LibClone.argsOnClone` and decoded in `MerkleDrop`; a reviewer should confirm
  the decode order matches the pack order at the `LibClone.clone` call site
  (drift here silently corrupts every drop's config).
- *onApprove trust.* Only allow-listed tokens reach `_createDrop`, and the fee is
  computed on `msg.sender` (the token) — a hostile non-listed token calling
  `onApprove` directly reverts on the allow-list check; a listed-but-malicious
  token could at worst create drops funded by its own approvals.
- *Files.* `DropFactory.sol` (proxy/init/pause, `onApprove`, `_createDrop`,
  `supportsInterface`), `MerkleDrop.sol` (clone args). Tests: `OnApprove.t.sol`,
  `DropFactory.t.sol` (init/pause/upgrade), `GasSnapshot.t.sol` (§7.3 numbers
  re-measured on the clone architecture), `fork/` E2E (real TON `approveAndCall`
  on a Sepolia fork).

## 8. Out of scope (v1)

GatedDrop (on-chain snapshot/gated verification), social/task backends, vesting,
gasless, multichain, and notifications are deferred (see `docs/DEV-PLAN.md`).
This document covers the M2 core only.
