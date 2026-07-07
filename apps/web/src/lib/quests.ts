/**
 * Native quests (docs/SOCIAL-TASK-DESIGN.md) — shared types, field caps, and
 * client fetch helpers. Server-side validation lives in lib/server/questInput;
 * the caps here are shared with the forms so both sides agree.
 */

export const MAX_QUEST_TITLE = 120;
export const MAX_QUEST_TASKS = 10;
/** Lifetime per-operator campaign cap (storage guard, like announcements). */
export const MAX_QUESTS_PER_OPERATOR = 50;
// Task-config field grammar, shared by the create form and the server
// whitelist (questInput) so the two can't drift.
/** Discord snowflake ids (guild/role) — numeric strings. */
export const SNOWFLAKE_RE = /^\d{5,25}$/;
export const QUEST_URL_RE = /^https:\/\/[^\s]{1,300}$/;
/** Telegram public channel/group username or numeric chat id (`@name` or `-100…`). */
export const TELEGRAM_CHAT_RE = /^(@[A-Za-z0-9_]{5,32}|-?\d{5,20})$/;
/** GitHub username/org and repo name — the two path segments of owner/repo. */
export const GITHUB_NAME_RE = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;

/**
 * Verification tier per task kind (design §3: the tier is honest UI, fixed by
 * kind). v1 ships the free/certain kinds plus the click-trust LINK_VISIT;
 * X kinds are deliberately absent (§9 decision: no X module in v1). Onchain
 * kinds remain unlocked for a later slice.
 */
export const QUEST_TASK_KINDS = {
  DISCORD_JOIN: "VERIFIED",
  DISCORD_ROLE: "VERIFIED",
  TELEGRAM_JOIN: "VERIFIED",
  GITHUB_STAR: "VERIFIED",
  LINK_VISIT: "INTENT",
} as const;

export type QuestTaskKind = keyof typeof QUEST_TASK_KINDS;
export type QuestTier = (typeof QUEST_TASK_KINDS)[QuestTaskKind];

export type SocialProvider = "discord" | "telegram" | "github";

/** Social provider a kind verifies through (null = no account binding needed). */
export function providerForKind(kind: string): SocialProvider | null {
  if (kind.startsWith("DISCORD_")) return "discord";
  if (kind.startsWith("TELEGRAM_")) return "telegram";
  if (kind.startsWith("GITHUB_")) return "github";
  return null;
}

/** Distinct providers a task set verifies through (binding checklist). */
export function providersForTasks(tasks: { kind: string }[]): string[] {
  return [
    ...new Set(
      tasks
        .map((t) => providerForKind(t.kind))
        .filter((p): p is NonNullable<ReturnType<typeof providerForKind>> => p !== null),
    ),
  ];
}

export interface QuestTaskDto {
  id: string;
  kind: string;
  config: Record<string, string>;
  required: boolean;
  tier: string;
}

export interface QuestCampaignDto {
  id: string;
  chainId: number;
  operator: string;
  title: string;
  closesAt: string;
  amountMode: string;
  totalAmount: string;
  drop: string | null;
  tasks: QuestTaskDto[];
  createdAt: string;
  /** Present on the operator list (GET /api/quests): live eligible-wallet count. */
  eligibleCount?: number;
}

export interface QuestTaskInput {
  kind: QuestTaskKind;
  config: Record<string, string>;
  required: boolean;
}

export interface QuestCreateInput {
  chainId: number;
  title: string;
  closesAt: string; // ISO
  totalAmount: string;
  tasks: QuestTaskInput[];
}

async function readJson<T>(res: Response): Promise<T & { error?: string }> {
  try {
    return (await res.json()) as T & { error?: string };
  } catch {
    return { error: `Request failed (${res.status})` } as T & { error?: string };
  }
}

export async function createQuest(
  input: QuestCreateInput,
): Promise<{ campaign?: QuestCampaignDto; error?: string }> {
  const res = await fetch("/api/quests", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  return readJson(res);
}

export async function listMyQuests(): Promise<{
  campaigns?: QuestCampaignDto[];
  error?: string;
}> {
  return readJson(await fetch("/api/quests"));
}

export async function getQuest(
  id: string,
): Promise<{ campaign?: QuestCampaignDto; error?: string }> {
  return readJson(await fetch(`/api/quests/${encodeURIComponent(id)}`));
}

export interface QuestMeDto {
  completions: string[]; // completed task ids for the signed-in wallet
  bindings: { provider: string }[]; // active social bindings
}

export async function getQuestMe(
  id: string,
): Promise<QuestMeDto & { error?: string }> {
  return readJson(await fetch(`/api/quests/${encodeURIComponent(id)}/me`));
}

export async function verifyQuestTask(
  id: string,
  taskId: string,
): Promise<{ verified?: boolean; reason?: string; error?: string }> {
  const res = await fetch(
    `/api/quests/${encodeURIComponent(id)}/verify/${encodeURIComponent(taskId)}`,
    { method: "POST" },
  );
  return readJson(res);
}

export interface QuestCompletionsDto {
  wallets: string[];
  count: number;
  amountPerWallet: string | null;
}

export async function getQuestCompletions(
  id: string,
): Promise<QuestCompletionsDto & { error?: string }> {
  return readJson(await fetch(`/api/quests/${encodeURIComponent(id)}/completions`));
}
