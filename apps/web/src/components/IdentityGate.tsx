import { CheckCircle2, Shield, XCircle } from "lucide-react";
import { inkBtnClass, POP_CHIP, POP_PANEL } from "@/components/pop";

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
    <div className={`bg-white p-6 md:p-8 space-y-5 ${POP_PANEL}`}>
      <div className="flex items-center justify-between border-b border-ink/10 pb-4">
        <h3 className="text-sm font-bold uppercase tracking-wider text-ink font-mono flex items-center gap-2">
          <Shield className="w-4 h-4 text-ink" />
          zk-X509 Identity CA Gate
        </h3>
        {state === "open" || state === "verified" ? (
          <span className={`${POP_CHIP} text-ink bg-pop-mint border-ink flex items-center gap-1.5`}>
            <CheckCircle2 className="w-3.5 h-3.5" /> {state === "open" ? "NO GATE" : "VERIFIED"}
          </span>
        ) : state === "loading" ? (
          <span className="text-xs font-mono text-ink/50">checking…</span>
        ) : (
          <span className={`${POP_CHIP} text-ink bg-pop-yellow border-ink flex items-center gap-1.5`}>
            <XCircle className="w-3.5 h-3.5" /> AUTH REQUIRED
          </span>
        )}
      </div>

      {state === "open" ? (
        <p className="text-xs text-ink/70 leading-relaxed">
          This campaign has <strong className="text-ink">no identity gate</strong> — no
          verification is required. Any wallet on the distribution list can
          claim directly.
        </p>
      ) : (
        <p className="text-xs text-ink/70 leading-relaxed">
          This campaign is gated by the{" "}
          <strong className="text-ink">{registryLabel}</strong> registry.
          Recipients must hold a national-PKI digital signature verified in that
          registry; ScatterDrop checks it with zero-knowledge proofs.
        </p>
      )}

      {state === "verified" ? (
        <div className="bg-pop-mint/40 border border-ink/15 p-4 rounded-2xl flex items-start gap-3">
          <CheckCircle2 className="w-5 h-5 text-ink shrink-0 mt-0.5" />
          <p className="text-xs text-ink/80 leading-relaxed">
            Your connected wallet is verified on-chain for this registry. You can
            claim if eligible.
          </p>
        </div>
      ) : state === "unverified" ? (
        <div className="bg-pop-cream p-5 rounded-2xl border border-ink/15 space-y-3">
          <p className="text-xs text-ink/70 leading-relaxed">
            This wallet is not verified in {registryLabel}. Verify your identity
            with zk-X509 to claim (self-claim only).
          </p>
          <a
            className={`inline-block text-xs ${inkBtnClass("md")}`}
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
