"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useAccount } from "wagmi";
import { useQuery } from "@tanstack/react-query";
import { encodeFunctionData } from "viem";
import { merkleDropAbi } from "@tokamak-network/scatter-drop-sdk";
import {
  AlertCircle,
  ArrowLeft,
  Download,
  Loader2,
  Users,
} from "lucide-react";
import { TxButton } from "@/components/TxButton";
import { useCampaign } from "@/lib/campaigns";
import { getParticipantStats } from "@/lib/stub";
import { useMounted } from "@/lib/useMounted";

const TABS = ["Overview", "Participants", "Sweep"] as const;
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
    return (
      <div className="flex items-center justify-center p-12 text-slate-500">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );
  }
  if (isError || !campaign) {
    return (
      <div className="flex flex-col items-center justify-center p-12 bg-slate-900 border border-slate-800 rounded-xl text-center space-y-3">
        <AlertCircle className="w-8 h-8 text-slate-600" />
        <p className="text-slate-400 text-sm">
          {isError ? "Could not load campaign." : "Campaign not found."}
        </p>
        <Link href="/manage" className="text-emerald-600 text-sm hover:underline">
          ← Back to console
        </Link>
      </div>
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
        className="inline-flex items-center gap-2 text-slate-400 hover:text-slate-100 transition text-sm font-mono"
      >
        <ArrowLeft className="w-4 h-4" /> BACK TO CONSOLE
      </Link>

      <div>
        <h1 className="text-2xl font-bold text-slate-100 tracking-tight">
          {campaign.name}
        </h1>
        <p className="text-xs text-slate-500 font-mono mt-0.5">
          {campaign.drop}
        </p>
      </div>

      <div className="flex flex-wrap gap-1.5 bg-slate-950 p-1 rounded-lg border border-slate-800 w-fit">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-1.5 text-xs font-mono font-medium rounded transition ${
              tab === t
                ? "bg-slate-800 text-slate-100"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "Overview" && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Kpi label="Claim rate" value={`${campaign.claimedPct}%`} />
          <Kpi label="Total pool" value={campaign.totalAmount} />
          <Kpi
            label="Window"
            value={ended ? `Ended ${campaign.deadline}` : `Ends ${campaign.deadline}`}
          />
          <Kpi label="Type" value={campaign.identityRegistryLabel} />
          <Kpi label="Status" value={campaign.status} />
        </div>
      )}

      {tab === "Participants" && <Participants id={id} />}

      {tab === "Sweep" && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-4 max-w-xl">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 font-mono">
            Sweep unclaimed
          </h3>
          <p className="text-sm text-slate-400 leading-relaxed">
            After the deadline, the operator can recover unclaimed tokens back to
            their wallet (MerkleDrop.sweep).
          </p>
          {!isOperator ? (
            <p className="text-xs text-amber-600">
              Only the campaign operator can sweep.
            </p>
          ) : !ended ? (
            <p className="text-xs text-slate-500">
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

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
      <div className="text-xs font-mono text-slate-500">{label}</div>
      <div className="text-lg font-bold text-slate-100 mt-1">{value}</div>
    </div>
  );
}

function Participants({ id }: { id: string }) {
  const { data: stats, isPending, isError } = useQuery({
    queryKey: ["participantStats", id],
    queryFn: () => getParticipantStats(id),
  });

  if (isPending) {
    return (
      <div className="flex items-center justify-center p-12 text-slate-500">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );
  }
  if (isError || !stats) {
    return (
      <p className="text-sm text-amber-600">
        Could not load participant stats.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Kpi label="Eligible" value={stats.eligible.toLocaleString()} />
        <Kpi label="Verified" value={stats.verified.toLocaleString()} />
        <Kpi label="Claimed" value={stats.claimed.toLocaleString()} />
        <Kpi label="Unclaimed" value={stats.unclaimed.toLocaleString()} />
        <Kpi label="Claim rate" value={`${stats.claimRatePct}%`} />
      </div>
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-slate-300">
          <Users className="w-4 h-4 text-slate-500" />
          Participant breakdown &amp; distribution report
        </div>
        <Link
          href={`/manage/${id}/report`}
          className="btn inline-flex items-center gap-1 text-xs"
        >
          <Download className="w-3 h-3" /> Distribution report
        </Link>
      </div>
      <p className="text-xs text-slate-500 font-mono">
        Stats are stubbed (off-chain aggregation); live claim-event indexing
        lands in a later milestone.
      </p>
    </div>
  );
}
