"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAccount } from "wagmi";
import {
  AlertCircle,
  ClipboardCheck,
  ExternalLink,
  Loader2,
  Plus,
  Users,
} from "lucide-react";
import { ConnectGate } from "@/components/ConnectGate";
import { inkBtnClass, POP_CARD, POP_CHIP } from "@/components/pop";
import { EmptyBox } from "@/components/states";
import { useWalletSession } from "@/lib/useWalletSession";
import { listMyQuests, type QuestCampaignDto } from "@/lib/quests";

/**
 * Operator quest console (SOC-1' skeleton): the signed-in wallet's quest
 * campaigns with their shareable /q/[id] links and a live eligible-wallet
 * count. Campaign creation lives at /manage/quests/new.
 */
export default function ManageQuestsPage() {
  const { address } = useAccount();
  const { me, ensureSession, busy } = useWalletSession(
    "Sign in to scatter.drop to manage your quests.",
  );
  const [campaigns, setCampaigns] = useState<QuestCampaignDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!me.address) return;
    let stale = false;
    void listMyQuests().then((res) => {
      if (stale) return;
      if (res.error || !res.campaigns) setError(res.error ?? "Failed to load quests");
      else setCampaigns(res.campaigns);
    });
    return () => {
      stale = true;
    };
  }, [me.address]);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="font-chunk uppercase text-2xl md:text-3xl tracking-tight text-ink">
            Quest campaigns
          </h1>
          <p className="text-xs text-ink/60 font-medium mt-1">
            Verified tasks that build a recipient list — close the quest, then
            feed the completions into a SOCIAL drop.
          </p>
        </div>
        <Link
          href="/manage/quests/new"
          className={`text-xs flex items-center gap-1.5 ${inkBtnClass("lg")}`}
        >
          <Plus className="w-4 h-4" /> New Quest
        </Link>
      </div>

      <ConnectGate prompt="Connect the wallet that operates your quests.">
        {!me.address ? (
          <EmptyBox icon={<ClipboardCheck className="w-8 h-8 text-ink/40" />}>
            <div className="space-y-3">
              <p>Sign in to see your quest campaigns.</p>
              <button
                type="button"
                onClick={() => void ensureSession(address)}
                disabled={busy}
                className={`text-xs ${inkBtnClass("md")}`}
              >
                {busy ? "Signing in…" : "Sign in"}
              </button>
            </div>
          </EmptyBox>
        ) : error ? (
          <EmptyBox icon={<AlertCircle className="w-8 h-8 text-red-500" />}>
            {error}
          </EmptyBox>
        ) : campaigns === null ? (
          <EmptyBox icon={<Loader2 className="w-8 h-8 text-ink/40 animate-spin" />}>
            Loading your quests…
          </EmptyBox>
        ) : campaigns.length === 0 ? (
          <EmptyBox icon={<ClipboardCheck className="w-8 h-8 text-ink/40" />}>
            <div className="space-y-3">
              <p>No quest campaigns yet.</p>
              <Link href="/manage/quests/new" className={`text-xs ${inkBtnClass("md")}`}>
                + Create your first quest
              </Link>
            </div>
          </EmptyBox>
        ) : (
          <div className="grid gap-4">
            {campaigns.map((c) => {
              const closed = Date.parse(c.closesAt) <= Date.now();
              return (
                <div key={c.id} className={`bg-white p-5 space-y-3 ${POP_CARD}`}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 className="font-bold text-ink">{c.title}</h2>
                    <span className={POP_CHIP}>
                      {closed ? "Closed" : `Closes ${new Date(c.closesAt).toLocaleString()}`}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 text-xs text-ink/60 font-medium">
                    <span>
                      {c.tasks.length} task{c.tasks.length === 1 ? "" : "s"}
                    </span>
                    <span>
                      pot {c.totalAmount} · equal split
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Users className="w-3.5 h-3.5" />
                      {c.eligibleCount ?? "…"} eligible
                    </span>
                    {c.drop && <span className={POP_CHIP}>drop linked</span>}
                  </div>
                  <div className="flex flex-wrap items-center gap-3 text-xs font-bold">
                    <Link
                      href={`/q/${c.id}`}
                      className="inline-flex items-center gap-1 text-ink/70 hover:text-ink transition"
                    >
                      <ExternalLink className="w-3.5 h-3.5" /> Recipient page /q/{c.id.slice(0, 8)}…
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </ConnectGate>
    </div>
  );
}
