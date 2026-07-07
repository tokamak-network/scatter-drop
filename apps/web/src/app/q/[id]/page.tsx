"use client";

import { use, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useAccount } from "wagmi";
import {
  AlertCircle,
  BadgeCheck,
  CheckCircle2,
  ExternalLink,
  Link2,
  Loader2,
} from "lucide-react";
import { ConnectGate } from "@/components/ConnectGate";
import { inkBtnClass, POP_CARD, POP_CHIP, whiteBtnClass } from "@/components/pop";
import { EmptyBox } from "@/components/states";
import { useWalletSession } from "@/lib/useWalletSession";
import {
  getQuest,
  getQuestMe,
  providersForTasks,
  verifyQuestTask,
  type QuestCampaignDto,
  type QuestTaskDto,
} from "@/lib/quests";

/**
 * Recipient quest page (§9 decision: its own /q/[id] route, linked from the
 * campaign). Flow per docs/SOCIAL-TASK-DESIGN.md §4: connect + SIWE → bind the
 * social account → per-task "Check" hits the server verifier. Tier badges are
 * shown verbatim — an unverified task says so (§3.1 honesty rule).
 */

const TIER_STYLE: Record<string, string> = {
  VERIFIED: "bg-emerald-100 text-emerald-700",
  METERED: "bg-amber-100 text-amber-700",
  INTENT: "bg-ink/10 text-ink/60",
};

function taskTitle(t: QuestTaskDto): string {
  switch (t.kind) {
    case "DISCORD_JOIN":
      return "Join the Discord server";
    case "DISCORD_ROLE":
      return "Hold the required Discord role";
    case "LINK_VISIT":
      return t.config.label || "Visit the link";
    default:
      return t.kind;
  }
}

function taskLink(t: QuestTaskDto): string | null {
  if (t.kind === "LINK_VISIT") return t.config.url ?? null;
  return t.config.inviteUrl ?? null;
}

export default function QuestPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const search = useSearchParams();
  const { address } = useAccount();
  const { me, ensureSession, busy } = useWalletSession(
    "Sign in to scatter.drop to complete quest tasks.",
  );

  const [campaign, setCampaign] = useState<QuestCampaignDto | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [done, setDone] = useState<Set<string>>(new Set());
  const [bound, setBound] = useState<Set<string>>(new Set());
  const [checking, setChecking] = useState<string | null>(null);
  const [taskErrors, setTaskErrors] = useState<Record<string, string>>({});
  // Errors bounced back from the OAuth callback (?social_error=…).
  const socialError = search.get("social_error");

  useEffect(() => {
    void getQuest(id).then((res) => {
      if (res.error || !res.campaign) setLoadError(res.error ?? "Quest not found");
      else setCampaign(res.campaign);
    });
  }, [id]);

  const refreshMe = useCallback(async () => {
    if (!me.address) return;
    const res = await getQuestMe(id);
    if (!res.error) {
      setDone(new Set(res.completions));
      setBound(new Set(res.bindings.map((b) => b.provider)));
    }
  }, [id, me.address]);

  useEffect(() => {
    void refreshMe();
  }, [refreshMe]);

  const check = async (taskId: string) => {
    setTaskErrors((e) => ({ ...e, [taskId]: "" }));
    if (!(await ensureSession(address))) return;
    setChecking(taskId);
    try {
      const res = await verifyQuestTask(id, taskId);
      if (res.verified) {
        setDone((d) => new Set(d).add(taskId));
      } else {
        setTaskErrors((e) => ({
          ...e,
          [taskId]: res.reason ?? res.error ?? "Verification failed",
        }));
      }
    } finally {
      setChecking(null);
    }
  };

  if (loadError) {
    return (
      <EmptyBox icon={<AlertCircle className="w-8 h-8 text-red-500" />}>{loadError}</EmptyBox>
    );
  }
  if (!campaign) {
    return (
      <EmptyBox icon={<Loader2 className="w-8 h-8 text-ink/40 animate-spin" />}>
        Loading quest…
      </EmptyBox>
    );
  }

  const closed = Date.parse(campaign.closesAt) <= Date.now();
  const providers = providersForTasks(campaign.tasks);
  const requiredDone = campaign.tasks.filter((t) => t.required && done.has(t.id)).length;
  const requiredTotal = campaign.tasks.filter((t) => t.required).length;

  return (
    <div className="max-w-2xl mx-auto space-y-6 animate-fade-in">
      <div>
        <h1 className="font-chunk uppercase text-2xl md:text-3xl tracking-tight text-ink">
          {campaign.title}
        </h1>
        <p className="text-xs text-ink/60 font-medium mt-1">
          Complete the required tasks before{" "}
          {new Date(campaign.closesAt).toLocaleString()} to share the reward pot
          of {campaign.totalAmount} (split equally among everyone who finishes).
        </p>
      </div>

      {closed && (
        <div className={`bg-white p-4 text-xs font-bold text-ink/70 ${POP_CARD}`}>
          This quest has closed — completions are frozen for the drop.
        </div>
      )}

      <ConnectGate prompt="Connect your wallet to start the quest.">
        {/* Step 1: SIWE — completions are recorded against the verified wallet. */}
        {!me.address ? (
          <div className={`bg-white p-5 space-y-3 ${POP_CARD}`}>
            <p className="text-xs font-medium text-ink/70">
              Sign in with your wallet — tasks are checked server-side and
              recorded for the signed-in address.
            </p>
            <button
              type="button"
              onClick={() => void ensureSession(address)}
              disabled={busy}
              className={`text-xs ${inkBtnClass("md")}`}
            >
              {busy ? "Signing in…" : "Sign in"}
            </button>
          </div>
        ) : (
          <>
            {/* Step 2: social bindings for the providers this quest verifies through. */}
            {providers.map((provider) => (
              <div
                key={provider}
                className={`bg-white p-5 flex flex-wrap items-center justify-between gap-3 ${POP_CARD}`}
              >
                <div className="flex items-center gap-2 text-sm font-bold text-ink">
                  <Link2 className="w-4 h-4" />
                  {provider === "discord" ? "Discord account" : provider}
                  {bound.has(provider) && (
                    <span className="inline-flex items-center gap-1 text-emerald-600 text-xs">
                      <BadgeCheck className="w-4 h-4" /> linked
                    </span>
                  )}
                </div>
                {!bound.has(provider) && (
                  <a
                    href={`/api/oauth/${provider}/start?returnTo=${encodeURIComponent(`/q/${id}`)}`}
                    className={`text-xs ${inkBtnClass("md")}`}
                  >
                    Link {provider}
                  </a>
                )}
              </div>
            ))}
            {socialError && (
              <p className="text-[11px] text-rose-500 font-medium">{socialError}</p>
            )}

            {/* Step 3: the task checklist. */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-ink/60">
                  {requiredDone}/{requiredTotal} required tasks done
                </span>
              </div>
              {campaign.tasks.map((t) => {
                const link = taskLink(t);
                const isDone = done.has(t.id);
                return (
                  <div key={t.id} className={`bg-white p-4 space-y-2 ${POP_CARD}`}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2 text-sm font-bold text-ink">
                        {isDone ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                        ) : (
                          <span className="w-4 h-4 rounded-full border-2 border-ink/30 inline-block" />
                        )}
                        {taskTitle(t)}
                        {!t.required && (
                          <span className="text-[10px] text-ink/50 font-medium">optional</span>
                        )}
                      </div>
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${TIER_STYLE[t.tier] ?? POP_CHIP}`}
                        title={
                          t.tier === "VERIFIED"
                            ? "Checked server-side against the platform API"
                            : t.tier === "INTENT"
                              ? "Taken on trust — this click is not verified"
                              : t.tier
                        }
                      >
                        {t.tier === "INTENT" ? "UNVERIFIED" : t.tier}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {link && (
                        <a
                          href={link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={`text-xs inline-flex items-center gap-1 ${whiteBtnClass("sm")}`}
                        >
                          <ExternalLink className="w-3.5 h-3.5" /> Open
                        </a>
                      )}
                      {!isDone && !closed && (
                        <button
                          type="button"
                          onClick={() => void check(t.id)}
                          disabled={checking === t.id}
                          className={`text-xs ${inkBtnClass("sm")}`}
                        >
                          {checking === t.id ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            "Check"
                          )}
                        </button>
                      )}
                    </div>
                    {taskErrors[t.id] && (
                      <p className="text-[11px] text-rose-500">{taskErrors[t.id]}</p>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </ConnectGate>
    </div>
  );
}
