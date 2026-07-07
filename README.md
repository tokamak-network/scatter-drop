# scatter-drop

A **self-service, multi-tenant airdrop platform** where anyone can create a campaign and distribute
tokens to their own customers. Campaigns can be gated by **zk-X509 identity verification** — the
**operator decides per campaign**. When gating is on, only wallets registered in the campaign's chosen
IdentityRegistry (a national PKI or a self-issued CA) can claim; when off, the claim is open.

> Positioning: **neutral distribution infrastructure** — identity verification is *optional*, so the same
> platform covers open public airdrops as well as real-name, legally-scoped distribution (RWA / regulated
> tokens) backed by a national PKI. Token allow-listing and fees are admin-curated.
> See [`docs/DESIGN.md`](docs/DESIGN.md) · [`docs/FRONTEND-IA.md`](docs/FRONTEND-IA.md) · [`docs/DEV-PLAN.md`](docs/DEV-PLAN.md).

## Monorepo layout

```
contracts/        Foundry — DropFactory, MerkleDrop (+ upcoming GatedDrop)
packages/merkle/  CSV → Merkle tree / proof generation library
packages/sdk/     @tokamak-network/scatter-drop-sdk — core, merkle, identity, claim, react bindings
apps/web/         Next.js operator dashboard, claim pages, and API routes (+ Prisma persistence)
scripts/          dev-fork / seed / verify scripts for a local clickable environment
docs/             design, IA, and development-plan documents
```

## Identity gate (zk-X509 integration)

Two kinds of identity verification can be enforced on a campaign:

| Gate     | Applies to            | CA registry                 | Enforced at |
|----------|-----------------------|-----------------------------|-------------|
| Operator | the wallet creating a campaign | one global registry (admin-registered) | `createDrop` |
| Customer | the wallet claiming an airdrop | chosen per campaign         | `claim`     |

Integrates with [zk-X509](https://github.com/tokamak-network) RegistryFactory / IdentityRegistry.

## What's built

- **Optional identity gating** — operator gate (`createDrop`) and per-campaign customer gate (`claim`),
  with a shared `GatePreview` that shows a wallet whether it would pass before it acts.
- **CSV → Merkle drops** — deterministic `(address, amount)` list → Merkle root + per-claim proofs, via
  `packages/merkle`; the claim path verifies proofs against the on-chain root.
- **Multi-network registry** — platform admins register supported networks (chainId, RPC, contract
  addresses); the app resolves the DropFactory from the registry, so campaigns can target different chains.
- **Recipient-list durability** — proofs are stored server-side, pinned to IPFS, and the CID can be
  anchored on-chain (`publishProofs`) so claimers can recover the list even if the app is gone. Campaigns
  whose list was never stored can re-upload the CSV and re-publish it after verifying the rebuilt root
  matches the on-chain root.
- **Recipient builder** — import candidates (Dune queries, TON staking snapshots) and distribute
  equally, pro-rata, or quadratically; embedded in the create wizard.
- **Social-task quests** *(in progress)* — operators can require quest completion (e.g. Discord server
  join / role) as an eligibility source; verified completions reduce to the same `(address, amount)` list
  → Merkle path. Task verification is surfaced honestly by tier (VERIFIED / METERED / INTENT). Discord is
  shipped; Telegram and GitHub verifiers are in review. See [`docs/SOCIAL-TASK-DESIGN.md`](docs/SOCIAL-TASK-DESIGN.md).
- **TON one-transaction path** — `approveAndCall` / `onApprove` so a TON-denominated drop can be funded
  and created in a single transaction (factory implements ERC165 `supportsInterface`).
- **Admin curation** — per-token percentage fees and a token allow-list.

## Development

```bash
# dependencies
pnpm install
git submodule update --init --recursive   # contracts/lib

# contracts
pnpm contracts:build
pnpm contracts:test
```

Requirements: Foundry, pnpm ≥ 8, Node ≥ 20.

### Local clickable environment

Stand up an anvil fork of Sepolia with the real zk-X509 registries, deploy a DropFactory, seed a demo
campaign, and wire the web app:

```bash
# one-time DB init (Prisma needs DATABASE_URL + a pushed schema before any seed)
echo 'DATABASE_URL="file:./dev.db"' >> apps/web/.env
pnpm --filter @scatter-drop/web db:push      # apply the schema (creates the tables)

scripts/dev-fork.sh                          # anvil fork + deploy + seed (+ writes apps/web/.env.local)
pnpm --filter @scatter-drop/web db:seed      # re-seed the network registry after each redeploy
pnpm --filter @scatter-drop/web dev          # → http://localhost:3000
```

The fork runs on chain-id `31337` by default (not Sepolia's real `11155111`) so a wallet can't
silently broadcast to the live network; override with `FORK_CHAIN_ID` if needed.

The app resolves the DropFactory from the DB registry, so re-run the seed after every `dev-fork.sh`
redeploy. See [`docs/LOCAL-TESTING.md`](docs/LOCAL-TESTING.md) for details.

## License

MIT
