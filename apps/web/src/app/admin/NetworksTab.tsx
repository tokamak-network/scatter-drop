"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { useAdminSession } from "@/lib/useAdminSession";

interface Network {
  chainId: number;
  name: string;
  rpcUrl?: string;
  publicRpcUrl?: string | null;
  explorerUrl?: string | null;
  nativeSymbol: string;
  dropFactory: string;
  feeToken?: string | null;
  treasury?: string | null;
  enabled: boolean;
}

const BLANK_FORM = {
  chainId: "",
  name: "",
  rpcUrl: "",
  publicRpcUrl: "",
  explorerUrl: "",
  nativeSymbol: "ETH",
  dropFactory: "",
  feeToken: "",
  treasury: "",
};

export function NetworksTab() {
  const { me, signIn, signOut, busy, error } = useAdminSession();
  const [networks, setNetworks] = useState<Network[]>([]);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ ...BLANK_FORM });
  const [formErr, setFormErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!me.isAdmin) return;
    setLoading(true);
    try {
      const res = await fetch("/api/admin/networks");
      if (res.ok) setNetworks((await res.json()).networks ?? []);
    } finally {
      setLoading(false);
    }
  }, [me.isAdmin]);
  useEffect(() => {
    void load();
  }, [load]);

  const add = async () => {
    setSaving(true);
    setFormErr(null);
    try {
      const res = await fetch("/api/admin/networks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, chainId: Number(form.chainId) }),
      });
      const data = await res.json();
      if (!res.ok) setFormErr(data.error ?? "Failed to add");
      else {
        setForm({ ...BLANK_FORM });
        void load();
      }
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (n: Network) => {
    await fetch(`/api/admin/networks/${n.chainId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: !n.enabled }),
    });
    void load();
  };
  const remove = async (n: Network) => {
    if (!confirm(`Delete network ${n.name} (${n.chainId})?`)) return;
    await fetch(`/api/admin/networks/${n.chainId}`, { method: "DELETE" });
    void load();
  };

  if (!me.isAdmin) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-3">
        <h3 className="text-sm font-bold text-slate-100">Platform admin sign-in</h3>
        <p className="text-xs text-slate-400">
          Managing supported networks requires a signed-in platform admin. Sign a
          message with an allow-listed wallet (no gas, no transaction).
        </p>
        <button
          onClick={signIn}
          disabled={busy}
          className="inline-flex items-center gap-2 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-white font-bold px-4 py-2 rounded-lg text-sm"
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : null} Sign in with wallet
        </button>
        {error && <p className="text-xs text-red-500">{error}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <span className="text-[11px] font-mono text-emerald-600">
          Signed in: {me.address?.slice(0, 6)}…{me.address?.slice(-4)}
        </span>
        <button onClick={signOut} className="text-[11px] text-slate-400 hover:underline">
          Sign out
        </button>
      </div>

      <Card title={`Supported networks (${networks.length})`}>
        {loading ? (
          <Loader2 className="w-5 h-5 animate-spin text-slate-500" />
        ) : networks.length === 0 ? (
          <p className="text-xs text-slate-500">No networks yet. Add one below.</p>
        ) : (
          <div className="space-y-2">
            {networks.map((n) => (
              <div
                key={n.chainId}
                className="flex items-center justify-between gap-2 bg-slate-950 border border-slate-800/70 rounded-lg px-3 py-2 text-xs"
              >
                <div className="min-w-0">
                  <div className="text-slate-100 font-semibold">
                    {n.name}{" "}
                    <span className="text-slate-500 font-mono">· chain {n.chainId}</span>
                  </div>
                  <div className="text-slate-500 font-mono truncate">
                    factory {n.dropFactory.slice(0, 10)}…{n.dropFactory.slice(-6)}
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span
                    className={`font-mono text-[10px] font-bold px-2 py-0.5 rounded border ${
                      n.enabled
                        ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
                        : "bg-slate-800 text-slate-400 border-slate-700/50"
                    }`}
                  >
                    {n.enabled ? "ENABLED" : "DISABLED"}
                  </span>
                  <button onClick={() => toggle(n)} className="text-emerald-600 hover:underline">
                    {n.enabled ? "Disable" : "Enable"}
                  </button>
                  <button onClick={() => remove(n)} className="text-slate-500 hover:text-red-500">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card title="Add a network">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          <Field label="Chain ID *" value={form.chainId} onChange={(v) => setForm({ ...form, chainId: v })} placeholder="11155111" />
          <Field label="Name *" value={form.name} onChange={(v) => setForm({ ...form, name: v })} placeholder="Sepolia" />
          <Field label="RPC URL * (server)" value={form.rpcUrl} onChange={(v) => setForm({ ...form, rpcUrl: v })} placeholder="https://…" />
          <Field label="Public RPC URL (browser)" value={form.publicRpcUrl} onChange={(v) => setForm({ ...form, publicRpcUrl: v })} placeholder="https://…" />
          <Field label="DropFactory *" value={form.dropFactory} onChange={(v) => setForm({ ...form, dropFactory: v })} placeholder="0x…" />
          <Field label="Fee token" value={form.feeToken} onChange={(v) => setForm({ ...form, feeToken: v })} placeholder="0x…" />
          <Field label="Treasury" value={form.treasury} onChange={(v) => setForm({ ...form, treasury: v })} placeholder="0x…" />
          <Field label="Explorer URL" value={form.explorerUrl} onChange={(v) => setForm({ ...form, explorerUrl: v })} placeholder="https://…" />
          <Field label="Native symbol" value={form.nativeSymbol} onChange={(v) => setForm({ ...form, nativeSymbol: v })} placeholder="ETH" />
        </div>
        {formErr && <p className="text-xs text-red-500 mt-2">{formErr}</p>}
        <button
          onClick={add}
          disabled={saving}
          className="mt-3 inline-flex items-center gap-2 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-white font-bold px-4 py-2 rounded-lg text-sm"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Add network
        </button>
      </Card>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-4">
      <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 font-mono">{title}</h3>
      {children}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400">{label}</span>
      <input
        className="input font-mono text-xs"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </label>
  );
}
