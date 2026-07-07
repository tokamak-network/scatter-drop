/**
 * WalletSocial binding rules (docs/SOCIAL-TASK-DESIGN.md §7): 1 social account
 * = 1 wallet, enforced on the (provider, providerAccountId) PK. Unbind is
 * SOFT — the row survives with `unboundAt` set — so rebinding is gated by a
 * cooldown and history stays auditable. The pure rule functions live here
 * (unit-testable); the OAuth callback applies them inside a transaction.
 */

export const REBIND_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export interface BindingRow {
  wallet: string;
  unboundAt: Date | null;
}

/**
 * May `wallet` (re)bind a social account whose existing row is `existing`
 * (null = never bound)? Returns a user-facing error string, else null.
 */
export function bindError(
  existing: BindingRow | null,
  wallet: string,
  now: Date = new Date(),
): string | null {
  if (!existing) return null;
  if (existing.unboundAt === null) {
    // Active binding: idempotent for the same wallet, refused for any other —
    // this is the sybil axis, so no silent account moves.
    return existing.wallet === wallet
      ? null
      : "This account is already linked to another wallet.";
  }
  const readyAt = existing.unboundAt.getTime() + REBIND_COOLDOWN_MS;
  if (now.getTime() < readyAt) {
    const days = Math.ceil((readyAt - now.getTime()) / (24 * 60 * 60 * 1000));
    return `This account was recently unlinked — it can be linked again in ${days} day${days === 1 ? "" : "s"}.`;
  }
  return null;
}

/**
 * One ACTIVE binding per (wallet, provider): binding a second account to the
 * same wallet would make "the wallet's discord account" ambiguous for
 * verifiers and let one wallet farm multiple accounts' completions.
 */
export function walletAlreadyBoundError(
  activeAccountIdForWallet: string | null,
  providerAccountId: string,
): string | null {
  if (activeAccountIdForWallet && activeAccountIdForWallet !== providerAccountId) {
    return "This wallet already has a linked account for this platform — unlink it first.";
  }
  return null;
}
