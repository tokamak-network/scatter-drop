"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useAccount } from "wagmi";
import { encodeFunctionData, type Hex } from "viem";
import { merkleDropAbi } from "@tokamak-network/scatter-drop-sdk";
import { AlertCircle, ArrowLeft, Download, Users } from "lucide-react";
import { CopyButton } from "@/components/CopyButton";
import { pillClass, POP_HEADING, POP_PANEL, whiteBtnClass } from "@/components/pop";
import { EmptyBox, PageSpinner } from "@/components/states";
import { TxButton } from "@/components/TxButton";
import { TxHashLink } from "@/components/TxHashLink";
import { useCampaign, useCampaignStats } from "@/lib/campaigns";
import { useProofsMeta } from "@/lib/proofs";
import { MetaEditor } from "./MetaEditor";
import { ProofsPanel } from "./ProofsPanel";
import type { Campaign } from "@/lib/stub";
import { useMounted } from "@/lib/useMounted";

const TABS = ["Overview", "Participants", "Proofs", "Sweep"] as const;
type Tab = (typeof TABS)[number];

export default function ManageCampaignPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { data: campaign, isPending, isError } = useCampaign(id);
  const { address } = useAccount();
  const mounted = useMounted();
  const [tab, setTab] = useState<Tab>("Overview");

  if (isPending) {
    return <PageSpinner />;
  }
  if (isError || !campaign) {
    return (
      <EmptyBox
        icon={<AlertCircle className="w-8 h-8 text-ink/40" />}
        action={
          <Link href="/manage" className="text-ink text-sm font-bold hover:underline">
            ← Back to console
          </Link>
        }
      >
        {isError ? "Could not load campaign." : "Campaign not found."}
      </EmptyBox>
    );
  }

  // Guard wallet/time-derived state behind mount to avoid SSR hydration drift.
  const now = BigInt(Math.floor((mounted ? Date.now() : 0) / 1000));
  const ended = mounted && now > campaign.deadlineUnix;
  const isOperator =
    mounted &&
    !!address &&
    address.toLowerCase() === campaign.operator.toLowerCase();

  return (
    <div className="space-y-6 animate-fade-in">
      <Link
        href="/manage"
        className="inline-flex items-center gap-2 text-ink/60 hover:text-ink transition text-sm font-bold"
      >
        <ArrowLeft className="w-4 h-4" /> Back to console
      </Link>

      <div>
        <h1 className="font-chunk uppercase text-2xl md:text-3xl tracking-tight text-ink">
          {campaign.name}
        </h1>
        <p className="text-xs text-ink/50 font-mono mt-1">{campaign.drop}</p>
        {campaign.creationTx && <CreationTx hash={campaign.creationTx} />}
      </div>

      <div className="flex flex-wrap gap-1.5 w-fit">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            aria-pressed={tab === t}
            onClick={() => setTab(t)}
            className={pillClass(tab === t, "bg-pop-yellow")}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "Overview" && (
        <div className="space-y-4">
          <Overview campaign={campaign} ended={ended} />
          {isOperator && <MetaEditor campaign={campaign} />}
        </div>
      )}

      {tab === "Participants" && <Participants campaign={campaign} />}

      {tab === "Proofs" && (
        <ProofsPanel campaign={campaign} isOperator={isOperator} />
      )}

      {tab === "Sweep" && (
        <div className={`bg-white p-6 space-y-4 max-w-xl ${POP_PANEL}`}>
          <h3 className={POP_HEADING}>Sweep unclaimed</h3>
          <p className="text-sm text-ink/70 leading-relaxed">
            After the deadline, the operator can recover unclaimed tokens back to
            their wallet (MerkleDrop.sweep).
          </p>
          {!isOperator ? (
            <p className="text-xs font-medium text-amber-600">
              Only the campaign operator can sweep.
            </p>
          ) : !ended ? (
            <p className="text-xs text-ink/50">
              Available after the deadline ({campaign.deadline}).
            </p>
          ) : (
            <TxButton
              request={{
                to: campaign.drop,
                data: encodeFunctionData({
                  abi: merkleDropAbi,
                  functionName: "sweep",
                }),
              }}
              label="Sweep remaining"
              primary
            />
          )}
        </div>
      )}
    </div>
  );
}

/**
 * The campaign's creation (createDrop) transaction — explorer link when the
 * network has one, and always copyable, since chains without an explorer
 * (e.g. the local fork) would otherwise leave the full hash unreachable.
 */
function CreationTx({ hash }: { hash: Hex }) {
  return (
    <p className="text-xs text-ink/50 font-mono mt-1 flex items-center gap-1.5">
      Created in tx <TxHashLink hash={hash} />
      <CopyButton value={hash} label="Copy transaction hash" />
    </p>
  );
}

/**
 * Overview KPIs. Claim rate comes from live Claimed logs (stats.pct is the
 * amount-distributed percentage) — campaign.claimedPct is a static 0 and
 * would contradict the live Participants tab on the same page.
 */
function Overview({ campaign, ended }: { campaign: Campaign; ended: boolean }) {
  const { data: stats } = useCampaignStats(campaign);
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <Kpi label="Claim rate" value={`${stats?.pct ?? campaign.claimedPct}%`} />
      <Kpi label="Total pool" value={campaign.totalAmount} />
      <Kpi
        label="Window"
        value={ended ? `Ended ${campaign.deadline}` : `Ends ${campaign.deadline}`}
      />
      <Kpi label="Type" value={campaign.identityRegistryLabel} />
      <Kpi label="Status" value={campaign.status} />
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className={`bg-white p-5 ${POP_PANEL}`}>
      <div className="text-[10px] font-mono font-bold uppercase tracking-wider text-ink/50">
        {label}
      </div>
      <div className="text-lg font-bold text-ink mt-1">{value}</div>
    </div>
  );
}

/**
 * Live participant stats: eligible from the published proofs store (recipient
 * count), claimed from on-chain Claimed logs, the rest derived. No off-chain
 * indexer — same sources the claim page itself uses.
 */
function Participants({ campaign }: { campaign: Campaign }) {
  // isLoading (pending AND fetching), not isPending: for campaigns without a
  // merkleRoot/totalRaw these queries are disabled, and a disabled query
  // stays isPending forever — the spinner would never resolve.
  const { data: meta, isLoading: metaLoading, isError: metaError } = useProofsMeta(campaign);
  const {
    data: stats,
    isLoading: statsLoading,
    isError: statsError,
  } = useCampaignStats(campaign);

  if (metaLoading || statsLoading) {
    return <PageSpinner />;
  }
  // A fetch failure must not masquerade as "0 claims" / "list not published".
  if (metaError || statsError) {
    return (
      <p className="text-sm font-medium text-amber-600">
        Could not load participant stats — check the fork/RPC and retry.
      </p>
    );
  }

  const claimed = stats?.claimedCount ?? 0;
  const eligible = meta?.count ?? null; // null = recipient list not published
  const unclaimed = eligible !== null ? Math.max(0, eligible - claimed) : null;
  // Capped at 100 so a republished-smaller list (or scan-window skew) can't
  // print >100% next to a floored unclaimed of 0.
  const claimRatePct =
    eligible !== null && eligible > 0
      ? Math.min(100, Math.round((claimed / eligible) * 100))
      : null;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi label="Eligible" value={eligible !== null ? eligible.toLocaleString() : "—"} />
        <Kpi label="Claimed" value={claimed.toLocaleString()} />
        <Kpi label="Unclaimed" value={unclaimed !== null ? unclaimed.toLocaleString() : "—"} />
        <Kpi label="Claim rate" value={claimRatePct !== null ? `${claimRatePct}%` : "—"} />
      </div>
      {eligible === null && (
        <p className="text-xs font-medium text-amber-600">
          The recipient list isn&apos;t published, so eligible/unclaimed counts are
          unavailable — see the Proofs tab.
        </p>
      )}
      {stats && (
        <p className="text-xs text-ink/50 font-mono">
          Distributed {stats.distributed} · Remaining {stats.remaining}
        </p>
      )}
      <div className={`bg-white p-5 flex items-center justify-between ${POP_PANEL}`}>
        <div className="flex items-center gap-2 text-sm text-ink/70">
          <Users className="w-4 h-4 text-ink/50" />
          Participant breakdown &amp; distribution report
        </div>
        <Link
          href={`/manage/${campaign.id}/report`}
          className={`inline-flex items-center gap-1 text-xs ${whiteBtnClass("md")}`}
        >
          <Download className="w-3 h-3" /> Distribution report
        </Link>
      </div>
    </div>
  );
}
