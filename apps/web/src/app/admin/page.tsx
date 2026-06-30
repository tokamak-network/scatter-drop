"use client";

import { useState } from "react";
import Link from "next/link";
import { formatUnits, isAddress, parseUnits, type Address } from "viem";
import {
  AirdropType,
  airdropTypeLabel,
  buildAddAllowedTokenRequest,
  buildRemoveAllowedTokenRequest,
  buildSetFeeRequest,
  buildSetOfficialTokenRequest,
  NATIVE_FEE_TOKEN,
  TokenTier,
} from "@tokamak-network/scatter-drop-sdk";
import { Loader2, ShieldCheck } from "lucide-react";
import { TxButton } from "@/components/TxButton";
import { VaultWithdraw } from "@/components/VaultWithdraw";
import {
  deploymentIssue,
  useCollectedFees,
  useDeployment,
  useErc20Decimals,
  useFeeOf,
  useTokenTier,
} from "@/lib/contracts";
import { useCampaigns } from "@/lib/campaigns";
import { isPositiveDecimal } from "@/lib/validation";

const TABS = ["Overview", "Funds", "Tokens", "Campaigns", "Vault"] as const;
type Tab = (typeof TABS)[number];

const TYPES = [
  AirdropType.CSV,
  AirdropType.ONCHAIN_SNAPSHOT,
  AirdropType.ONCHAIN_GATED,
  AirdropType.SOCIAL,
];

type FeeToken = { addr: Address; label: string };

export default function AdminPage() {
  const { data: dep, isLoading } = useDeployment();
  const [tab, setTab] = useState<Tab>("Overview");

  const issue = deploymentIssue(dep, isLoading);
  if (issue || !dep) {
    return <p className="text-slate-400 text-sm">{issue ?? "No deployment."}</p>;
  }
  const factory = dep.dropFactory;
  const feeTokens: FeeToken[] = [
    { addr: NATIVE_FEE_TOKEN, label: "ETH" },
    ...(dep.feeToken ? [{ addr: dep.feeToken, label: "ERC-20 fee token" }] : []),
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <div className="inline-flex items-center gap-1.5 text-[11px] font-mono text-amber-600">
          <ShieldCheck className="w-3.5 h-3.5" /> PLATFORM ADMIN
        </div>
        <h1 className="text-2xl font-bold text-slate-100 tracking-tight">
          DropFactory Governance Center
        </h1>
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

      {tab === "Overview" && <Overview factory={factory} feeTokens={feeTokens} />}
      {tab === "Funds" && <Funds factory={factory} feeTokens={feeTokens} />}
      {tab === "Tokens" && <Tokens factory={factory} />}
      {tab === "Campaigns" && <Campaigns />}
      {tab === "Vault" && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
          <VaultWithdraw />
        </div>
      )}
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-4">
      <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 font-mono">
        {title}
      </h3>
      {children}
    </div>
  );
}

function Overview({
  factory,
  feeTokens,
}: {
  factory: Address;
  feeTokens: FeeToken[];
}) {
  const { data: campaigns } = useCampaigns();
  const { data: collected } = useCollectedFees(factory, feeTokens[0]?.addr);

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <Card title="Campaigns (on-chain)">
        <div className="text-2xl font-bold text-slate-100">
          {campaigns?.campaigns.length ?? "…"}
        </div>
      </Card>
      <Card title="Collected fees (ETH)">
        <div className="text-2xl font-bold text-slate-100">
          {collected === undefined ? "…" : formatUnits(collected, 18)}
        </div>
      </Card>
      <Card title="DropFactory">
        <div className="text-xs font-mono text-slate-400 break-all">{factory}</div>
      </Card>
    </div>
  );
}

function Funds({ factory, feeTokens }: { factory: Address; feeTokens: FeeToken[] }) {
  return (
    <Card title="Per-token creation fees (feeOf · setFee)">
      <div className="space-y-5">
        {feeTokens.map((ft) => (
          <div key={ft.addr} className="space-y-2">
            <div className="text-xs font-mono text-slate-300">
              {ft.label}
              {ft.addr === NATIVE_FEE_TOKEN ? " (native)" : ` · ${ft.addr}`}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {TYPES.map((t) => (
                <FeeCell
                  key={`${ft.addr}-${t}`}
                  factory={factory}
                  feeToken={ft.addr}
                  type={t}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function FeeCell({
  factory,
  feeToken,
  type,
}: {
  factory: Address;
  feeToken: Address;
  type: AirdropType;
}) {
  const { data: fee, refetch } = useFeeOf(factory, feeToken, type);
  const isEth = feeToken === NATIVE_FEE_TOKEN;
  const { data: erc20Decimals } = useErc20Decimals(isEth ? undefined : feeToken);
  const dp = isEth ? 18 : (erc20Decimals ?? 18);
  const [amount, setAmount] = useState("");
  const valid = isPositiveDecimal(amount, dp);
  const req = valid
    ? buildSetFeeRequest(factory, feeToken, type, parseUnits(amount, dp))
    : null;

  return (
    <div className="bg-slate-950 border border-slate-800/80 rounded-lg p-3 space-y-2">
      <div className="flex justify-between text-xs">
        <span className="text-slate-300">{airdropTypeLabel(type)}</span>
        <span className="font-mono text-slate-400">
          {fee === undefined ? "…" : formatUnits(fee, dp)}
        </span>
      </div>
      <div className="flex gap-2">
        <input
          className="input"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="new fee"
        />
        <TxButton
          request={req}
          label="setFee"
          disabled={!valid}
          onConfirmed={() => {
            setAmount("");
            void refetch();
          }}
        />
      </div>
    </div>
  );
}

function Tokens({ factory }: { factory: Address }) {
  const [token, setToken] = useState("");
  const valid = isAddress(token);
  const { data: tier, refetch } = useTokenTier(
    factory,
    valid ? (token as Address) : undefined,
  );
  const t = valid ? (token as Address) : undefined;

  return (
    <Card title="Allowed token registry (setOfficial · remove)">
      <input
        className="input"
        value={token}
        onChange={(e) => setToken(e.target.value)}
        placeholder="Token address 0x…"
      />
      {t && tier !== undefined && (
        <div className="space-y-3">
          <div className="text-xs font-mono text-slate-400">
            Current tier:{" "}
            <span className="text-slate-200">
              {Number(tier) === TokenTier.OFFICIAL
                ? "OFFICIAL"
                : Number(tier) === TokenTier.COMMUNITY
                  ? "COMMUNITY"
                  : "NONE"}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <TxButton
              request={buildAddAllowedTokenRequest(factory, t)}
              label="Add (community)"
              onConfirmed={() => void refetch()}
            />
            <TxButton
              request={buildSetOfficialTokenRequest(factory, t, true)}
              label="Set official"
              primary
              onConfirmed={() => void refetch()}
            />
            <TxButton
              request={buildSetOfficialTokenRequest(factory, t, false)}
              label="Unset official"
              onConfirmed={() => void refetch()}
            />
            <TxButton
              request={buildRemoveAllowedTokenRequest(factory, t)}
              label="Remove"
              onConfirmed={() => void refetch()}
            />
          </div>
        </div>
      )}
    </Card>
  );
}

function Campaigns() {
  const { data, isPending } = useCampaigns();
  if (isPending) {
    return (
      <div className="flex items-center justify-center p-12 text-slate-500">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );
  }
  const campaigns = data?.campaigns ?? [];
  return (
    <Card title={`All campaigns (${campaigns.length})`}>
      <div className="grid gap-2">
        {campaigns.map((c) => (
          <Link
            key={c.id}
            href={`/c/${c.id}`}
            className="flex justify-between items-center bg-slate-950 border border-slate-800/80 rounded-lg p-3 text-xs hover:border-slate-700"
          >
            <span className="text-slate-200">{c.name}</span>
            <span className="font-mono text-slate-500">
              {airdropTypeLabel(c.type)} · {c.status}
            </span>
          </Link>
        ))}
        {campaigns.length === 0 && (
          <p className="text-slate-500 text-xs">No campaigns on-chain yet.</p>
        )}
      </div>
    </Card>
  );
}
