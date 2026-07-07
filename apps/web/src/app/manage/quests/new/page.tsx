"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAccount, useChainId, useChains } from "wagmi";
import { ArrowLeft, ClipboardCheck, Loader2, Plus, Trash2 } from "lucide-react";
import { ConnectGate } from "@/components/ConnectGate";
import { NetworkPills } from "@/components/NetworkSelect";
import { inkBtnClass, POP_LABEL, POP_PANEL, popInputClass } from "@/components/pop";
import { useWalletSession } from "@/lib/useWalletSession";
import { isPositiveDecimal } from "@/lib/validation";
import {
  createQuest,
  GITHUB_OWNER_RE,
  GITHUB_REPO_RE,
  MAX_QUEST_TASKS,
  MAX_QUEST_TITLE,
  QUEST_TASK_KINDS,
  QUEST_URL_RE,
  SNOWFLAKE_RE,
  TELEGRAM_CHAT_RE,
  type QuestTaskKind,
} from "@/lib/quests";

const inputCls = popInputClass("px-3 py-2 rounded-xl");
const labelCls = POP_LABEL;

interface TaskDraft {
  /** Client-only identity for React keys — never sent to the server. */
  id: string;
  kind: QuestTaskKind;
  guildId: string;
  roleId: string;
  chatId: string;
  owner: string;
  repo: string;
  inviteUrl: string;
  url: string;
  label: string;
  required: boolean;
}

function newTaskDraft(): TaskDraft {
  return {
    id: crypto.randomUUID(),
    kind: "DISCORD_JOIN",
    guildId: "",
    roleId: "",
    chatId: "",
    owner: "",
    repo: "",
    inviteUrl: "",
    url: "",
    label: "",
    required: true,
  };
}

const KIND_LABELS: Record<QuestTaskKind, string> = {
  DISCORD_JOIN: "Join a Discord server",
  DISCORD_ROLE: "Hold a Discord role",
  TELEGRAM_JOIN: "Join a Telegram channel/group",
  GITHUB_STAR: "Star a GitHub repo",
  LINK_VISIT: "Visit a link (unverified)",
};

function draftToInput(t: TaskDraft) {
  const config: Record<string, string> = {};
  switch (t.kind) {
    case "DISCORD_JOIN":
    case "DISCORD_ROLE":
      config.guildId = t.guildId.trim();
      if (t.inviteUrl.trim()) config.inviteUrl = t.inviteUrl.trim();
      if (t.kind === "DISCORD_ROLE") config.roleId = t.roleId.trim();
      break;
    case "TELEGRAM_JOIN":
      config.chatId = t.chatId.trim();
      if (t.inviteUrl.trim()) config.inviteUrl = t.inviteUrl.trim();
      break;
    case "GITHUB_STAR":
      config.owner = t.owner.trim();
      config.repo = t.repo.trim();
      break;
    case "LINK_VISIT":
      config.url = t.url.trim();
      if (t.label.trim()) config.label = t.label.trim();
      break;
  }
  return { kind: t.kind, config, required: t.required };
}

function draftValid(t: TaskDraft): boolean {
  switch (t.kind) {
    case "LINK_VISIT":
      return QUEST_URL_RE.test(t.url.trim());
    case "DISCORD_JOIN":
      return SNOWFLAKE_RE.test(t.guildId.trim());
    case "DISCORD_ROLE":
      return SNOWFLAKE_RE.test(t.guildId.trim()) && SNOWFLAKE_RE.test(t.roleId.trim());
    case "TELEGRAM_JOIN":
      return TELEGRAM_CHAT_RE.test(t.chatId.trim());
    case "GITHUB_STAR":
      return GITHUB_OWNER_RE.test(t.owner.trim()) && GITHUB_REPO_RE.test(t.repo.trim());
  }
}

/**
 * Quest creation skeleton (SOC-1'): campaign fields + a minimal task editor
 * for the v1 kinds. The created quest's shareable page is /q/[id]; on close,
 * the completions aggregate feeds the SOCIAL drop wizard.
 */
export default function NewQuestPage() {
  const router = useRouter();
  const walletChainId = useChainId();
  const chains = useChains();
  const { address } = useAccount();
  const { me, ensureSession, busy } = useWalletSession(
    "Sign in to scatter.drop to manage your quests.",
  );

  const [selectedChainId, setSelectedChainId] = useState<number | null>(null);
  const chainId = selectedChainId ?? walletChainId;
  const [title, setTitle] = useState("");
  const [closesAt, setClosesAt] = useState("");
  const [totalAmount, setTotalAmount] = useState("");
  const [tasks, setTasks] = useState<TaskDraft[]>(() => [newTaskDraft()]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const closesMs = Date.parse(closesAt);
  const valid =
    title.trim() !== "" &&
    !Number.isNaN(closesMs) &&
    closesMs > Date.now() &&
    isPositiveDecimal(totalAmount.trim()) &&
    tasks.length > 0 &&
    tasks.every(draftValid);

  const setTask = (id: string, patch: Partial<TaskDraft>) =>
    setTasks((ts) => ts.map((t) => (t.id === id ? { ...t, ...patch } : t)));

  const submit = async () => {
    setError(null);
    if (!(await ensureSession(address))) return;
    setSaving(true);
    try {
      const res = await createQuest({
        chainId,
        title: title.trim(),
        closesAt: new Date(closesMs).toISOString(),
        totalAmount: totalAmount.trim(),
        tasks: tasks.map(draftToInput),
      });
      if (res.error || !res.campaign) setError(res.error ?? "Failed to create quest");
      else router.push("/manage/quests");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6 animate-fade-in">
      <Link
        href="/manage/quests"
        className="inline-flex items-center gap-1.5 text-xs font-bold text-ink/60 hover:text-ink transition"
      >
        <ArrowLeft className="w-3.5 h-3.5" /> Quests
      </Link>

      <div>
        <h1 className="font-chunk uppercase text-2xl md:text-3xl tracking-tight text-ink flex items-center gap-2">
          <ClipboardCheck className="w-6 h-6 text-ink" /> New quest
        </h1>
        <p className="text-xs text-ink/60 font-medium mt-1">
          Recipients complete verified tasks before the close date; everyone who
          finishes the required ones splits the pot equally in the SOCIAL drop
          you create afterwards.
        </p>
      </div>

      <ConnectGate prompt="Connect the wallet that will operate the quest.">
        <NetworkPills
          chains={chains}
          activeId={chainId}
          onSelect={setSelectedChainId}
          title={(c, active) => (active ? "Quest for this network" : `Quest on ${c.name}`)}
        />

        <div className={`bg-white p-6 space-y-5 ${POP_PANEL}`}>
          <div>
            <label htmlFor="q-title" className={labelCls}>
              Title *
            </label>
            <input
              id="q-title"
              className={inputCls}
              maxLength={MAX_QUEST_TITLE}
              placeholder="ACME community quest — season 1"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="q-closes" className={labelCls}>
                Closes at *
              </label>
              <input
                id="q-closes"
                type="datetime-local"
                className={inputCls}
                value={closesAt}
                onChange={(e) => setClosesAt(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="q-amount" className={labelCls}>
                Total reward pot *
              </label>
              <input
                id="q-amount"
                className={inputCls}
                placeholder="10000 (token units, split equally)"
                value={totalAmount}
                onChange={(e) => setTotalAmount(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-3">
            <span className={labelCls}>Tasks (max {MAX_QUEST_TASKS})</span>
            {tasks.map((t, i) => (
              <div key={t.id} className="rounded-xl border-2 border-ink/15 p-3 space-y-2">
                <div className="flex gap-2 items-center">
                  <select
                    aria-label={`Task ${i + 1} kind`}
                    className={inputCls}
                    value={t.kind}
                    onChange={(e) => setTask(t.id, { kind: e.target.value as QuestTaskKind })}
                  >
                    {(Object.keys(QUEST_TASK_KINDS) as QuestTaskKind[]).map((k) => (
                      <option key={k} value={k}>
                        {KIND_LABELS[k]} · {QUEST_TASK_KINDS[k]}
                      </option>
                    ))}
                  </select>
                  <label className="flex items-center gap-1.5 text-xs font-bold text-ink/70 shrink-0">
                    <input
                      type="checkbox"
                      checked={t.required}
                      onChange={(e) => setTask(t.id, { required: e.target.checked })}
                    />
                    required
                  </label>
                  {tasks.length > 1 && (
                    <button
                      type="button"
                      aria-label={`Remove task ${i + 1}`}
                      onClick={() => setTasks((ts) => ts.filter((x) => x.id !== t.id))}
                      className="shrink-0 px-2 text-ink/40 hover:text-rose-500 transition"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>

                {t.kind === "LINK_VISIT" && (
                  <div className="flex gap-2">
                    <input
                      aria-label={`Task ${i + 1} URL`}
                      className={inputCls}
                      placeholder="https://… (shown as unverified / on trust)"
                      value={t.url}
                      onChange={(e) => setTask(t.id, { url: e.target.value })}
                    />
                    <input
                      aria-label={`Task ${i + 1} label`}
                      className={`${inputCls} basis-1/3`}
                      placeholder="Label"
                      value={t.label}
                      onChange={(e) => setTask(t.id, { label: e.target.value })}
                    />
                  </div>
                )}

                {(t.kind === "DISCORD_JOIN" || t.kind === "DISCORD_ROLE") && (
                  <div className="space-y-2">
                    <div className="flex gap-2">
                      <input
                        aria-label={`Task ${i + 1} server id`}
                        className={`${inputCls} font-mono`}
                        placeholder="Discord server id (e.g. 1029384756…)"
                        value={t.guildId}
                        onChange={(e) => setTask(t.id, { guildId: e.target.value })}
                      />
                      {t.kind === "DISCORD_ROLE" && (
                        <input
                          aria-label={`Task ${i + 1} role id`}
                          className={`${inputCls} font-mono`}
                          placeholder="Role id"
                          value={t.roleId}
                          onChange={(e) => setTask(t.id, { roleId: e.target.value })}
                        />
                      )}
                    </div>
                    <input
                      aria-label={`Task ${i + 1} invite URL`}
                      className={inputCls}
                      placeholder="https://discord.gg/… (invite shown to recipients)"
                      value={t.inviteUrl}
                      onChange={(e) => setTask(t.id, { inviteUrl: e.target.value })}
                    />
                    <p className="text-[10px] text-ink/50 leading-snug">
                      Verification uses the platform bot — it must be installed on
                      this server (Server Settings → enable Developer Mode to copy
                      ids).
                    </p>
                  </div>
                )}

                {t.kind === "TELEGRAM_JOIN" && (
                  <div className="space-y-2">
                    <input
                      aria-label={`Task ${i + 1} chat id`}
                      className={`${inputCls} font-mono`}
                      placeholder="@channelname or numeric chat id"
                      value={t.chatId}
                      onChange={(e) => setTask(t.id, { chatId: e.target.value })}
                    />
                    <input
                      aria-label={`Task ${i + 1} invite URL`}
                      className={inputCls}
                      placeholder="https://t.me/… (invite shown to recipients)"
                      value={t.inviteUrl}
                      onChange={(e) => setTask(t.id, { inviteUrl: e.target.value })}
                    />
                    <p className="text-[10px] text-ink/50 leading-snug">
                      Verification uses the admin bot — it must be an admin of
                      this channel/group.
                    </p>
                  </div>
                )}

                {t.kind === "GITHUB_STAR" && (
                  <div className="space-y-2">
                    <div className="flex gap-2">
                      <input
                        aria-label={`Task ${i + 1} repo owner`}
                        className={`${inputCls} font-mono`}
                        placeholder="owner (e.g. tokamak-network)"
                        value={t.owner}
                        onChange={(e) => setTask(t.id, { owner: e.target.value })}
                      />
                      <input
                        aria-label={`Task ${i + 1} repo name`}
                        className={`${inputCls} font-mono`}
                        placeholder="repo (e.g. scatter-drop)"
                        value={t.repo}
                        onChange={(e) => setTask(t.id, { repo: e.target.value })}
                      />
                    </div>
                    <p className="text-[10px] text-ink/50 leading-snug">
                      Verified with the recipient&apos;s own GitHub token — the
                      repo must be public.
                    </p>
                  </div>
                )}
              </div>
            ))}
            {tasks.length < MAX_QUEST_TASKS && (
              <button
                type="button"
                onClick={() => setTasks((ts) => [...ts, newTaskDraft()])}
                className="inline-flex items-center gap-1.5 text-xs font-bold text-ink/60 hover:text-ink transition"
              >
                <Plus className="w-3.5 h-3.5" /> Add task
              </button>
            )}
          </div>

          <div className="pt-3 border-t-2 border-ink/10 space-y-3">
            {error && <p className="text-[11px] text-rose-500">{error}</p>}
            <button
              type="button"
              onClick={() => void submit()}
              disabled={!valid || busy || saving}
              className={`w-full flex items-center justify-center gap-2 text-sm disabled:opacity-50 ${inkBtnClass("lg")}`}
            >
              {busy || saving ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : me.address ? (
                "Create quest"
              ) : (
                "Sign in & create quest"
              )}
            </button>
            <p className="text-[10px] text-ink/50 leading-snug">
              Creating a quest requires a one-time wallet signature (SIWE) so
              completions and the final drop are attributed to a verified
              operator.
            </p>
          </div>
        </div>
      </ConnectGate>
    </div>
  );
}
