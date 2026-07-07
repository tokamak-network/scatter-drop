/**
 * Input validation for the quest CRUD routes (docs/SOCIAL-TASK-DESIGN.md §6).
 * Same shape as announcementInput: pure parse functions returning
 * `{ value } | { error }` so the routes stay thin auth + persistence layers.
 */

import {
  MAX_QUEST_TASKS,
  MAX_QUEST_TITLE,
  QUEST_TASK_KINDS,
  QUEST_URL_RE,
  SNOWFLAKE_RE,
  type QuestTaskKind,
} from "@/lib/quests";
import { isPositiveDecimal } from "@/lib/validation";
import { isChainId, LOWER_ADDR_RE } from "./apiInput";

type Result<T> = { value: T } | { error: string };

const MAX_LABEL = 80;
/** Guard against absurd amount strings before the shared parser sees them. */
const MAX_AMOUNT_LEN = 40;

export interface QuestTaskCreate {
  kind: QuestTaskKind;
  config: string; // JSON-serialized, validated per kind
  required: boolean;
  tier: string;
}

export interface QuestCreate {
  chainId: number;
  title: string;
  closesAt: Date;
  amountMode: "equal";
  totalAmount: string;
  tasks: QuestTaskCreate[];
}

function parseTitle(v: unknown): Result<string> {
  const s = typeof v === "string" ? v.trim() : "";
  if (!s || s.length > MAX_QUEST_TITLE) {
    return { error: `title required (max ${MAX_QUEST_TITLE} chars)` };
  }
  return { value: s };
}

function parseClosesAt(v: unknown): Result<Date> {
  const d = typeof v === "string" && v ? new Date(v) : null;
  if (!d || Number.isNaN(d.getTime())) return { error: "closesAt must be a valid date" };
  if (d.getTime() <= Date.now()) return { error: "closesAt must be in the future" };
  return { value: d };
}

function parseAmount(v: unknown): Result<string> {
  const s = typeof v === "string" ? v.trim() : "";
  // isPositiveDecimal delegates to the SDK's parseHumanAmount — the one amount
  // grammar shared with CSV rows and the drop-build math, so a quest pot can't
  // validate here and then fail to scale in RecipientBuilder.
  if (s.length > MAX_AMOUNT_LEN || !isPositiveDecimal(s)) {
    return { error: "totalAmount must be a positive decimal amount" };
  }
  return { value: s };
}

/**
 * Per-kind config validation. Only whitelisted keys survive into the stored
 * JSON so a creative operator can't stash arbitrary payloads that the public
 * task list would then serve.
 */
function parseTaskConfig(
  kind: QuestTaskKind,
  raw: unknown,
): Result<Record<string, string>> {
  const cfg = (raw ?? {}) as Record<string, unknown>;
  const str = (k: string) => (typeof cfg[k] === "string" ? (cfg[k] as string).trim() : "");

  switch (kind) {
    case "DISCORD_JOIN":
    case "DISCORD_ROLE": {
      const guildId = str("guildId");
      if (!SNOWFLAKE_RE.test(guildId)) {
        return { error: `${kind}: config.guildId must be a Discord server id` };
      }
      const out: Record<string, string> = { guildId };
      if (kind === "DISCORD_ROLE") {
        const roleId = str("roleId");
        if (!SNOWFLAKE_RE.test(roleId)) {
          return { error: "DISCORD_ROLE: config.roleId must be a Discord role id" };
        }
        out.roleId = roleId;
      }
      // Optional invite link shown to recipients so they can actually join.
      const inviteUrl = str("inviteUrl");
      if (inviteUrl) {
        if (!QUEST_URL_RE.test(inviteUrl)) {
          return { error: `${kind}: config.inviteUrl must be an https:// URL` };
        }
        out.inviteUrl = inviteUrl;
      }
      return { value: out };
    }
    case "LINK_VISIT": {
      const url = str("url");
      if (!QUEST_URL_RE.test(url)) {
        return { error: "LINK_VISIT: config.url must be an https:// URL" };
      }
      const label = str("label");
      if (label.length > MAX_LABEL) {
        return { error: `LINK_VISIT: config.label max ${MAX_LABEL} chars` };
      }
      return { value: label ? { url, label } : { url } };
    }
  }
}

function parseTasks(v: unknown): Result<QuestTaskCreate[]> {
  if (!Array.isArray(v) || v.length === 0 || v.length > MAX_QUEST_TASKS) {
    return { error: `tasks must be a non-empty array of at most ${MAX_QUEST_TASKS}` };
  }
  const tasks: QuestTaskCreate[] = [];
  for (const item of v) {
    const { kind, config, required } = (item ?? {}) as {
      kind?: unknown;
      config?: unknown;
      required?: unknown;
    };
    // Object.hasOwn (not `in`) — `in` also matches the prototype chain (e.g.
    // "toString", "constructor"), which would let a crafted kind bypass the
    // switch in parseTaskConfig and fall through to `undefined`.
    if (typeof kind !== "string" || !Object.hasOwn(QUEST_TASK_KINDS, kind)) {
      return {
        error: `each task needs a supported kind (${Object.keys(QUEST_TASK_KINDS).join(", ")})`,
      };
    }
    if (required !== undefined && typeof required !== "boolean") {
      return { error: "each task's required field must be a boolean" };
    }
    const k = kind as QuestTaskKind;
    const parsedCfg = parseTaskConfig(k, config);
    if ("error" in parsedCfg) return parsedCfg;
    tasks.push({
      kind: k,
      config: JSON.stringify(parsedCfg.value),
      required: required ?? true,
      tier: QUEST_TASK_KINDS[k],
    });
  }
  if (!tasks.some((t) => t.required)) {
    // Otherwise eligibleWallets (required.length === 0) never has anything to
    // check, and no recipient can ever qualify for the pot.
    return { error: "at least one task must be required" };
  }
  return { value: tasks };
}

/** POST /api/quests body. */
export function parseQuestCreate(body: unknown): Result<QuestCreate> {
  if (typeof body !== "object" || body === null) {
    return { error: "Input must be a non-null object" };
  }
  const b = body as Record<string, unknown>;
  if (!isChainId(b.chainId)) return { error: "chainId must be a positive integer" };
  // §9 decision: v1 is equal split only — reject anything else loudly instead
  // of silently coercing.
  if (b.amountMode !== undefined && b.amountMode !== "equal") {
    return { error: 'amountMode must be "equal" (v1 supports equal split only)' };
  }
  const title = parseTitle(b.title);
  if ("error" in title) return title;
  const closesAt = parseClosesAt(b.closesAt);
  if ("error" in closesAt) return closesAt;
  const totalAmount = parseAmount(b.totalAmount);
  if ("error" in totalAmount) return totalAmount;
  const tasks = parseTasks(b.tasks);
  if ("error" in tasks) return tasks;
  return {
    value: {
      chainId: b.chainId,
      title: title.value,
      closesAt: closesAt.value,
      amountMode: "equal",
      totalAmount: totalAmount.value,
      tasks: tasks.value,
    },
  };
}

export interface QuestPatch {
  title?: string;
  closesAt?: Date;
  totalAmount?: string;
  drop?: string | null;
}

/**
 * PATCH /api/quests/[id] body — campaign fields only. Task edits are
 * deliberately out of v1 scope: changing tasks after recipients started
 * completing them would invalidate recorded completions.
 */
export function parseQuestPatch(body: unknown): Result<QuestPatch> {
  const b = (body ?? {}) as Record<string, unknown>;
  const patch: QuestPatch = {};
  if (b.title !== undefined) {
    const r = parseTitle(b.title);
    if ("error" in r) return r;
    patch.title = r.value;
  }
  if (b.closesAt !== undefined) {
    const r = parseClosesAt(b.closesAt);
    if ("error" in r) return r;
    patch.closesAt = r.value;
  }
  if (b.totalAmount !== undefined) {
    const r = parseAmount(b.totalAmount);
    if ("error" in r) return r;
    patch.totalAmount = r.value;
  }
  if (b.drop !== undefined) {
    if (b.drop === null) patch.drop = null;
    else {
      const drop = typeof b.drop === "string" ? b.drop.toLowerCase() : "";
      if (!LOWER_ADDR_RE.test(drop)) return { error: "drop must be a 0x… address" };
      patch.drop = drop;
    }
  }
  if (Object.keys(patch).length === 0) return { error: "empty patch" };
  return { value: patch };
}
