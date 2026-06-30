# @scatter-drop/web

Next.js (App Router) frontend for scatter-drop — the dashboard + claim pages.

> W6 scaffold. Routing, layout, wallet plumbing and shared primitives only.
> Data is **stubbed** (`src/lib/stub.ts`) — no contract calls yet. Real reads
> wire in across M5–M7.

## Stack

- Next.js 15 (App Router) + React 19
- wagmi v2 + viem (mainnet + local anvil, see `src/lib/wagmi.ts`)
- @tanstack/react-query (wagmi dependency)

## Develop

```bash
pnpm install            # from repo root (workspace)
pnpm --filter @scatter-drop/web dev      # http://localhost:3000
pnpm --filter @scatter-drop/web build
pnpm --filter @scatter-drop/web lint
```

## Routing (per docs/FRONTEND-IA.md)

| Route | Purpose |
|-------|---------|
| `/` | Landing + CTA |
| `/campaigns` | Explore — public campaign directory |
| `/c/[id]` | Campaign detail + claim (IdentityGate + EligibilityCheck) |
| `/claim` | My Claims — pre-confirmed (Merkle) shortcut list |
| `/manage` | Campaigns the connected wallet created |
| `/manage/new` | Create wizard (operator gate, CA registry, fee-by-type) |
| `/manage/[id]` | Overview · Participants · Sweep |
| `/admin/*` | Funds · Identity Registries · Vault · Campaigns (admin-gated) |

## Layout

```
src/app/         routes (App Router)
src/components/   Nav, NavLink, WalletConnect, NetworkBanner, ConnectGate,
                  states (Empty/Loading/Error), ui (PageHeader/Kpi/RowLink/…)
src/lib/wagmi.ts  chain config — single source of supported chains
src/lib/stub.ts   stub data layer — the seam M5–M7 swap for real reads
```

## Known follow-ups

- `src/lib/stub.ts` is synchronous; the real read seam (async server reads /
  wagmi hooks) is decided when M5 wiring lands.
- No web job in CI yet (`.github/workflows/ci.yml` runs contracts only).
