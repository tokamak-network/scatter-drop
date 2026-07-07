/**
 * Close-time aggregation (docs/SOCIAL-TASK-DESIGN.md §4⑤/§7②): which wallets
 * completed every REQUIRED task, counting a social-verified completion only
 * while its binding is still active and still points at the completing wallet.
 * Output feeds RecipientBuilder → buildDrop → createDrop(type=SOCIAL).
 */

import { formatUnits } from "viem";
import { parseHumanAmount } from "@tokamak-network/scatter-drop-sdk";
import { providerForKind } from "@/lib/quests";

export interface CompletionRow {
  wallet: string;
  taskId: string;
}

export interface TaskRow {
  id: string;
  kind: string;
  required: boolean;
}

export interface ActiveBinding {
  provider: string;
  wallet: string;
}

/**
 * Pure aggregation: wallets with a completion for EVERY required task, where
 * completions of provider-backed tasks additionally require an active binding
 * for (provider, wallet). Rebinding a social account to wallet B therefore
 * drops wallet A's social completions from the count (§7's second layer).
 */
export function eligibleWallets(
  tasks: TaskRow[],
  completions: CompletionRow[],
  activeBindings: ActiveBinding[],
): string[] {
  const required = tasks.filter((t) => t.required);
  if (required.length === 0) return [];
  const taskById = new Map(tasks.map((t) => [t.id, t]));
  const bound = new Set(activeBindings.map((b) => `${b.provider}:${b.wallet}`));

  const doneByWallet = new Map<string, Set<string>>();
  for (const c of completions) {
    const task = taskById.get(c.taskId);
    if (!task) continue;
    const provider = providerForKind(task.kind);
    if (provider && !bound.has(`${provider}:${c.wallet}`)) continue;
    let set = doneByWallet.get(c.wallet);
    if (!set) doneByWallet.set(c.wallet, (set = new Set()));
    set.add(c.taskId);
  }

  const wallets: string[] = [];
  for (const [wallet, done] of doneByWallet) {
    if (required.every((t) => done.has(t.id))) wallets.push(wallet);
  }
  return wallets.sort();
}

/**
 * Internal split precision — independent of any specific token's decimals
 * (the campaign's totalAmount isn't tied to one until RecipientBuilder scales
 * it there); 18 matches the cap questInput.parseAmount already enforces via
 * isPositiveDecimal, so a stored totalAmount always parses here.
 */
const SPLIT_DECIMALS = 18;

/**
 * Equal split of a human-unit decimal amount string across `count` wallets,
 * floored (never over-promises the pot). Uses the SDK's parseHumanAmount +
 * viem's formatUnits — the same base-unit scaling RecipientBuilder uses —
 * instead of hand-rolled decimal-string math.
 */
export function equalSplit(totalAmount: string, count: number): string | null {
  if (count <= 0) return null;
  const scaled = parseHumanAmount(totalAmount, SPLIT_DECIMALS);
  return formatUnits(scaled / BigInt(count), SPLIT_DECIMALS);
}
