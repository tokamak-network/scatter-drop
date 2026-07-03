import { CheckCircle2, Shield, XCircle } from "lucide-react";

type GateState = "open" | "loading" | "verified" | "unverified";

/**
 * zk-X509 customer identity gate card (campaign detail, left column).
 * Verification state is computed by the caller via SDK isVerificationValid.
 * Real registration happens off-chain (zk-X509) / via dev-verify.sh on the fork.
 */
export function IdentityGate({
  state,
  registryLabel,
}: {
  state: GateState;
  registryLabel: string;
}) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 md:p-8 space-y-5">
      <div className="flex items-center justify-between border-b border-slate-800 pb-4">
        <h3 className="text-sm font-bold uppercase tracking-wider text-slate-300 font-mono flex items-center gap-2">
          <Shield className="w-4 h-4 text-emerald-500" />
          zk-X509 Identity CA Gate
        </h3>
        {state === "open" ? (
          <span className="text-xs font-mono font-bold text-emerald-600 bg-emerald-950/30 px-3 py-1 rounded-full border border-emerald-500/20 flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5" /> NO GATE
          </span>
        ) : state === "verified" ? (
          <span className="text-xs font-mono font-bold text-emerald-600 bg-emerald-950/30 px-3 py-1 rounded-full border border-emerald-500/20 flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5" /> VERIFIED
          </span>
        ) : state === "loading" ? (
          <span className="text-xs font-mono text-slate-500">checking…</span>
        ) : (
          <span className="text-xs font-mono font-bold text-amber-600 bg-amber-950/20 px-3 py-1 rounded-full border border-amber-500/20 flex items-center gap-1.5">
            <XCircle className="w-3.5 h-3.5" /> AUTH REQUIRED
          </span>
        )}
      </div>

      {state === "open" ? (
        <p className="text-xs text-slate-400 leading-relaxed">
          This campaign has{" "}
          <strong className="text-slate-200">no identity gate</strong> — no
          verification is required. Any wallet on the distribution list can
          claim directly.
        </p>
      ) : (
        <p className="text-xs text-slate-400 leading-relaxed">
          This campaign is gated by the{" "}
          <strong className="text-slate-200">{registryLabel}</strong> registry.
          Recipients must hold a national-PKI digital signature verified in that
          registry; ScatterDrop checks it with zero-knowledge proofs.
        </p>
      )}

      {state === "verified" ? (
        <div className="bg-emerald-950/20 border border-emerald-900/40 p-4 rounded-lg flex items-start gap-3">
          <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
          <p className="text-xs text-slate-300 leading-relaxed">
            Your connected wallet is verified on-chain for this registry. You can
            claim if eligible.
          </p>
        </div>
      ) : state === "unverified" ? (
        <div className="bg-slate-950 p-5 rounded-lg border border-slate-800 space-y-3">
          <p className="text-xs text-slate-400 leading-relaxed">
            This wallet is not verified in {registryLabel}. Verify your identity
            with zk-X509 to claim (self-claim only).
          </p>
          <a
            className="inline-block bg-slate-100 hover:bg-white text-slate-950 font-semibold px-4 py-2 rounded text-xs transition"
            href="https://github.com/tokamak-network"
            target="_blank"
            rel="noopener noreferrer"
          >
            Verify with zk-X509 →
          </a>
        </div>
      ) : null}
    </div>
  );
}
