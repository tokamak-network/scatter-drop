"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAccount } from "wagmi";
import { formatUnits, isAddress, parseUnits, type Address } from "viem";
import {
  airdropTypeLabel,
  buildSetAllowedTokenRequest,
  buildSetDefaultFeeBpsRequest,
  buildSetDefaultFeeModeRequest,
  buildSetFeeBpsRequest,
  buildSetFeeModeRequest,
  buildSetFlatFeeRequest,
  buildSetApproveAndCallSupportRequest,
  FeeMode,
  NATIVE_ETH,
  TokenTier,
} from "@tokamak-network/scatter-drop-sdk";
import { Loader2, ShieldCheck } from "lucide-react";
import { TxButton } from "@/components/TxButton";
import { VaultWithdraw } from "@/components/VaultWithdraw";
import { NetworksTab } from "./NetworksTab";
import {
  deploymentIssue,
  useDefaultFeeBps,
  useDefaultFeeMode,
  useDeployment,
  useErc20Decimals,
  useFeeBpsOf,
  useFeeModeOf,
  useFlatFee,
  useIsAdmin,
  useSupportsApproveAndCall,
  useTokenTier,
} from "@/lib/contracts";
import { useAllowedTokens, useCampaigns } from "@/lib/campaigns";
import { isPositiveDecimal } from "@/lib/validation";

const TABS = ["Overview", "Funds", "Tokens", "Campaigns", "Vault", "Networks"] as const;
type Tab = (typeof TABS)[number];

const MAX_FEE_BPS = 1000; // 10% — mirrors the contract cap
const isBps = (s: string) =>
  /^\d+$/.test(s) && Number(s) >= 0 && Number(s) <= MAX_FEE_BPS;

// Common established ERC-20s on the Sepolia fork (verified on-chain). Native ETH
// has its own dedicated enable toggle (it isn't an ERC-20 address to paste).
const TOKEN_PRESETS = [
  { label: "USDC", address: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238" },
  { label: "USDT", address: "0xaA8E23Fb1079EA71e0a56F48a2aA51851D8433D0" },
  { label: "DAI", address: "0xFF34B3d4Aee8ddCd6F9AFFFB6Fe49bD371b8a357" },
] as const;

export default function AdminPage() {
  const { data: dep, isLoading } = useDeployment();
  const { address } = useAccount();
  const isAdmin = useIsAdmin(address);
  const [tab, setTab] = useState<Tab>("Overview");

  const issue = deploymentIssue(dep, isLoading);
  if (issue || !dep) {
    return <p className="text-slate-400 text-sm">{issue ?? "No deployment."}</p>;
  }
  const factory = dep.dropFactory;
  const ownerHint = dep.deployer
    ? `${dep.deployer.slice(0, 6)}…${dep.deployer.slice(-4)}`
    : "the DropFactory owner";

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

      {!isAdmin && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-xs text-amber-700 space-y-1">
          <div className="font-bold flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5" /> View-only — you are not the platform admin
          </div>
          <p className="leading-relaxed text-amber-700/90">
            Every action here is gated to the <strong>DropFactory owner</strong> (
            <span className="font-mono">{ownerHint}</span>). Your connected wallet
            isn&apos;t the owner, so these transactions will revert. Connect the
            owner wallet to manage fees, the token allow-list, and fee withdrawals.
          </p>
        </div>
      )}

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

      {tab === "Overview" && <Overview factory={factory} />}
      {tab === "Funds" && <Funds factory={factory} />}
      {tab === "Tokens" && <Tokens factory={factory} />}
      {tab === "Campaigns" && <Campaigns />}
      {tab === "Vault" && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
          <VaultWithdraw />
        </div>
      )}
      {tab === "Networks" && <NetworksTab />}
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

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card title={label}>
      <div className="text-2xl font-bold text-slate-100">{value}</div>
    </Card>
  );
}

function Overview({ factory }: { factory: Address }) {
  const { data: campaigns } = useCampaigns();
  const { data: mode } = useDefaultFeeMode(factory);
  const { data: bps } = useDefaultFeeBps(factory);

  const defaultFee =
    mode === undefined
      ? "…"
      : Number(mode) === FeeMode.PERCENT
        ? bps === undefined
          ? "…"
          : `${Number(bps) / 100}% (percent)`
        : "flat (per token)";

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <Stat
        label="Campaigns (on-chain)"
        value={String(campaigns?.campaigns.length ?? "…")}
      />
      <Stat label="Default fee" value={defaultFee} />
      <Card title="DropFactory">
        <div className="text-xs font-mono text-slate-400 break-all">{factory}</div>
      </Card>
    </div>
  );
}

function Funds({ factory }: { factory: Address }) {
  return (
    <div className="space-y-4">
      <DefaultFeeConfig factory={factory} />
      <TokenFeeConfig factory={factory} />
    </div>
  );
}

function DefaultFeeConfig({ factory }: { factory: Address }) {
  const { data: mode, refetch: refMode } = useDefaultFeeMode(factory);
  const { data: bps, refetch: refBps } = useDefaultFeeBps(factory);
  const [bpsInput, setBpsInput] = useState("");

  const modeNum = mode === undefined ? undefined : Number(mode);

  return (
    <Card title="Platform default fee">
      <div className="flex items-center gap-2 text-xs">
        <span className="text-slate-400">Current default mode:</span>
        <span className="text-slate-200 font-mono">
          {modeNum === undefined
            ? "…"
            : modeNum === FeeMode.PERCENT
              ? "PERCENT"
              : "FLAT"}
        </span>
        {modeNum === FeeMode.PERCENT && (
          <span className="text-slate-400">
            · {bps === undefined ? "…" : `${Number(bps)} bps (${Number(bps) / 100}%)`}
          </span>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <TxButton
          request={buildSetDefaultFeeModeRequest(factory, FeeMode.PERCENT)}
          label="Default → PERCENT"
          onConfirmed={() => void refMode()}
        />
        <TxButton
          request={buildSetDefaultFeeModeRequest(factory, FeeMode.FLAT)}
          label="Default → FLAT"
          onConfirmed={() => void refMode()}
        />
      </div>
      <div className="flex gap-2">
        <input
          className="input"
          value={bpsInput}
          onChange={(e) => setBpsInput(e.target.value)}
          placeholder={`Default bps (0–${MAX_FEE_BPS}, 50 = 0.5%)`}
        />
        <TxButton
          request={
            isBps(bpsInput)
              ? buildSetDefaultFeeBpsRequest(factory, Number(bpsInput))
              : null
          }
          label="Set default bps"
          disabled={!isBps(bpsInput)}
          onConfirmed={() => {
            setBpsInput("");
            void refBps();
          }}
        />
      </div>
    </Card>
  );
}

function TokenFeeConfig({ factory }: { factory: Address }) {
  const [token, setToken] = useState("");
  const valid = isAddress(token);
  const t = valid ? (token as Address) : undefined;

  const { data: mode, refetch: refMode } = useFeeModeOf(factory, t);
  const { data: bps, refetch: refBps } = useFeeBpsOf(factory, t);
  const { data: flat, refetch: refFlat } = useFlatFee(factory, t);
  const { data: decimals } = useErc20Decimals(t);
  const { data: supportsAac, refetch: refAac } = useSupportsApproveAndCall(factory, t);
  const dp = decimals ?? 18;

  const [bpsInput, setBpsInput] = useState("");
  const [flatInput, setFlatInput] = useState("");
  // Parse once, safely: derive validity from a successful parse so the inline
  // request builder never calls parseUnits with an out-of-range value (crash).
  let flatAmount: bigint | null = null;
  if (isPositiveDecimal(flatInput, dp)) {
    try {
      flatAmount = parseUnits(flatInput, dp);
    } catch {
      flatAmount = null;
    }
  }
  const flatValid = flatAmount !== null;

  const modeNum = mode === undefined ? undefined : Number(mode);

  return (
    <Card title="Per-token fee override">
      <input
        className="input"
        value={token}
        onChange={(e) => setToken(e.target.value)}
        placeholder="Token address 0x…"
      />
      {t && (
        <div className="space-y-3">
          <div className="text-xs font-mono text-slate-400">
            Mode:{" "}
            <span className="text-slate-200">
              {modeNum === undefined
                ? "…"
                : modeNum === FeeMode.PERCENT
                  ? `PERCENT (${bps === undefined ? "…" : `${Number(bps)} bps`})`
                  : `FLAT (${flat === undefined ? "…" : formatUnits(flat, dp)})`}
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            <TxButton
              request={buildSetFeeModeRequest(factory, t, FeeMode.PERCENT)}
              label="Mode → PERCENT"
              onConfirmed={() => void refMode()}
            />
            <TxButton
              request={buildSetFeeModeRequest(factory, t, FeeMode.FLAT)}
              label="Mode → FLAT"
              onConfirmed={() => void refMode()}
            />
          </div>
          <div className="flex gap-2">
            <input
              className="input"
              value={bpsInput}
              onChange={(e) => setBpsInput(e.target.value)}
              placeholder={`bps (0–${MAX_FEE_BPS})`}
            />
            <TxButton
              request={
                isBps(bpsInput)
                  ? buildSetFeeBpsRequest(factory, t, Number(bpsInput))
                  : null
              }
              label="Set bps"
              disabled={!isBps(bpsInput)}
              onConfirmed={() => {
                setBpsInput("");
                void refBps();
              }}
            />
          </div>
          <div className="flex gap-2">
            <input
              className="input"
              value={flatInput}
              onChange={(e) => setFlatInput(e.target.value)}
              placeholder={`flat fee (token units, ${dp} dp)`}
            />
            <TxButton
              request={
                flatAmount !== null
                  ? buildSetFlatFeeRequest(factory, t, flatAmount)
                  : null
              }
              label="Set flat fee"
              disabled={!flatValid}
              onConfirmed={() => {
                setFlatInput("");
                void refFlat();
              }}
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-mono text-slate-400">
              approveAndCall (one-tx):{" "}
              <span className="text-slate-200">
                {supportsAac === undefined ? "…" : supportsAac ? "enabled" : "disabled"}
              </span>
            </span>
            <TxButton
              request={buildSetApproveAndCallSupportRequest(factory, t, true)}
              label="Enable one-tx"
              disabled={supportsAac === true}
              onConfirmed={() => void refAac()}
            />
            <TxButton
              request={buildSetApproveAndCallSupportRequest(factory, t, false)}
              label="Disable one-tx"
              disabled={supportsAac === false}
              onConfirmed={() => void refAac()}
            />
          </div>
        </div>
      )}
    </Card>
  );
}

// Off-chain curation note (advisory) persisted locally per token.
function useCurationNote(token: string) {
  const [note, setNote] = useState("");
  const key = `curation-note:${token.toLowerCase()}`;
  useEffect(() => {
    if (!token) return setNote("");
    try {
      setNote(localStorage.getItem(key) ?? "");
    } catch {
      setNote("");
    }
  }, [token, key]);
  const save = (v: string) => {
    setNote(v);
    try {
      localStorage.setItem(key, v);
    } catch {
      /* ignore */
    }
  };
  return [note, save] as const;
}

function NativeEthToggle({ factory }: { factory: Address }) {
  const { data: tier, refetch } = useTokenTier(factory, NATIVE_ETH);
  const { refetch: refetchList } = useAllowedTokens();
  const enabled = tier !== undefined && Number(tier) === TokenTier.ALLOWED;
  const refresh = () => {
    void refetch();
    void refetchList();
  };

  const loading = tier === undefined;
  return (
    <Card title="Native ETH">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-mono font-bold text-slate-100">Ξ ETH</span>
            <span
              className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full ${
                enabled
                  ? "bg-emerald-500/10 text-emerald-600 border border-emerald-500/20"
                  : "bg-slate-800 text-slate-400 border border-slate-700/50"
              }`}
            >
              {loading ? "…" : enabled ? "ON" : "OFF"}
            </span>
          </div>
          <p className="text-[11px] text-slate-500 mt-1 max-w-md">
            When on, operators can airdrop native ETH (funded from their wallet,
            no wrapper) and ETH is selectable in the campaign wizard.
          </p>
        </div>
        {/* One action, matching the current state — no confusing dual buttons. */}
        {enabled ? (
          <TxButton
            request={buildSetAllowedTokenRequest(factory, NATIVE_ETH, false)}
            label="Turn off"
            disabled={loading}
            onConfirmed={refresh}
          />
        ) : (
          <TxButton
            request={buildSetAllowedTokenRequest(factory, NATIVE_ETH, true)}
            label="Turn on"
            primary
            disabled={loading}
            onConfirmed={refresh}
          />
        )}
      </div>
    </Card>
  );
}

function Tokens({ factory }: { factory: Address }) {
  const [token, setToken] = useState("");
  const valid = isAddress(token);
  const t = valid ? (token as Address) : undefined;
  const { data: tier, refetch } = useTokenTier(factory, t);
  const { data: decimals } = useErc20Decimals(t);
  const { data: allowedList, refetch: refetchList } = useAllowedTokens();
  const [note, setNote] = useCurationNote(valid ? token : "");

  const allowed = tier !== undefined && Number(tier) === TokenTier.ALLOWED;
  const refreshAll = () => {
    void refetch();
    void refetchList();
  };

  return (
    <div className="space-y-4">
      <NativeEthToggle factory={factory} />
      <Card title="Allowed ERC-20 curation (admin)">
      <p className="text-[11px] text-slate-500">
        Curate which established assets (e.g. WETH, USDC, USDT) operators may use.
        The platform is neutral infrastructure — this is a suitability decision,
        not a securities determination.
      </p>

      {/* Currently allowed */}
      <div className="rounded-lg bg-slate-950 border border-slate-800/60 p-3 space-y-2">
        <div className="text-[10px] font-mono uppercase tracking-wider text-slate-400">
          Currently allowed ({allowedList?.length ?? 0})
        </div>
        {allowedList && allowedList.length > 0 ? (
          <div className="space-y-1.5">
            {allowedList.map((a) => (
              <div
                key={a.token}
                className="flex items-center justify-between gap-2 text-xs"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-mono font-bold text-emerald-600 shrink-0">
                    {a.symbol}
                  </span>
                  <span className="font-mono text-slate-400 truncate">
                    {a.token.slice(0, 8)}…{a.token.slice(-6)}
                  </span>
                </div>
                <button
                  onClick={() => setToken(a.token)}
                  className="shrink-0 text-emerald-600 hover:underline font-mono"
                >
                  Manage
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-[11px] text-slate-500">
            No tokens allow-listed yet. Add one below.
          </p>
        )}
      </div>

      {/* Add a token */}
      <div className="pt-2 border-t border-slate-800/60 text-[10px] font-mono uppercase tracking-wider text-slate-400">
        Add a token
      </div>
      <div className="space-y-1.5">
        <div className="text-[10px] font-mono uppercase tracking-wider text-slate-500">
          Quick pick (Sepolia)
        </div>
        <div className="flex flex-wrap gap-2">
          {TOKEN_PRESETS.map((p) => (
            <button
              key={p.address}
              onClick={() => setToken(p.address)}
              className={`px-3 py-1.5 rounded-lg border text-xs font-mono transition ${
                token.toLowerCase() === p.address.toLowerCase()
                  ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-600"
                  : "border-slate-800 bg-slate-950 text-slate-200 hover:border-slate-700"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <input
        className="input"
        value={token}
        onChange={(e) => setToken(e.target.value)}
        placeholder="Token address 0x…"
      />
      {t && tier !== undefined && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-xs">
            <span className="text-slate-400">Status:</span>
            <span
              className={`font-mono font-bold px-2 py-0.5 rounded border ${
                allowed
                  ? "bg-emerald-950/40 text-emerald-600 border-emerald-900/40"
                  : "bg-amber-950/20 text-amber-600 border-amber-500/20"
              }`}
            >
              {allowed ? "ALLOWED" : "NOT ALLOWED"}
            </span>
            {decimals !== undefined && (
              <span className="text-slate-500">· {decimals} dp</span>
            )}
          </div>

          <label className="block space-y-1">
            <span className="label">Curation note (off-chain · symbol / source)</span>
            <textarea
              className="input font-mono text-xs"
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. USDC — Circle, canonical Sepolia deployment"
            />
          </label>

          <div className="flex gap-2">
            <TxButton
              request={buildSetAllowedTokenRequest(factory, t, true)}
              label="Allow token"
              primary
              disabled={allowed}
              onConfirmed={refreshAll}
            />
            <TxButton
              request={buildSetAllowedTokenRequest(factory, t, false)}
              label="Revoke"
              disabled={!allowed}
              onConfirmed={refreshAll}
            />
          </div>
        </div>
      )}
      </Card>
    </div>
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
