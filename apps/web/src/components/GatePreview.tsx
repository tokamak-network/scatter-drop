"use client";

import { useState } from "react";
import { useAccount } from "wagmi";
import { isAddress, type Address } from "viem";
import { CheckCircle2, Loader2, ShieldQuestion, XCircle } from "lucide-react";
import { POP_CHIP, POP_HEADING, POP_PANEL, popInputClass } from "@/components/pop";
import { useGateState } from "@/lib/contracts";
import { fmtUnixDateTime } from "@/lib/campaigns";

/**
 * "Would this wallet pass the gate?" preview for zk-X509 identity-gated
 * campaigns — a pure, read-only check shared by the campaign wizard (operator
 * confirming a registry) and the public detail page (a recipient checking
 * before they claim). Gate state comes from `useGateState`; no mutation, so
 * any address can be looked up without connecting a wallet.
 *
 * @param registry      the campaign's identity registry (zk-X509 IdentityRegistry).
 * @param defaultAddress a wallet to prefill the check with (falls back to the
 *                       connected wallet); the field is always editable.
 */
export function GatePreview({
  registry,
  defaultAddress,
}: {
  registry: Address;
  defaultAddress?: Address;
}) {
  const { address: connected } = useAccount();
  // Any non-empty entry overrides the fallback: a complete address is checked;
  // an incomplete/invalid one leaves checkAddr undefined (shown as INVALID) so
  // the check waits rather than silently reverting to the default/connected
  // wallet. An empty field falls back to the default, then the connected wallet.
  const [manual, setManual] = useState("");
  const trimmed = manual.trim();
  const typing = trimmed !== "";
  const manualValid = isAddress(trimmed, { strict: false });
  const checkAddr: Address | undefined = typing
    ? manualValid
      ? (trimmed as Address)
      : undefined
    : (defaultAddress ?? connected);
  const inputId = `gate-check-${registry}`;

  const { status, verifiedUntil } = useGateState(registry, checkAddr);

  return (
    <div className={`bg-white p-5 space-y-3 ${POP_PANEL}`}>
      <h3 className={`${POP_HEADING} flex items-center gap-1.5`}>
        <ShieldQuestion className="w-4 h-4 text-ink" /> Gate check
      </h3>

      {status === "off" ? (
        <p className="text-[11px] text-ink/50">
          This campaign has no identity gate — every wallet on the distribution list can claim
          directly.
        </p>
      ) : (
        <>
          <label
            htmlFor={inputId}
            className="block text-[11px] font-mono font-bold uppercase tracking-wider text-ink/50"
          >
            Wallet to check
          </label>
          <input
            id={inputId}
            value={manual}
            onChange={(e) => setManual(e.target.value)}
            placeholder={defaultAddress ?? connected ?? "0x…"}
            spellCheck={false}
            className={`${popInputClass("rounded-full px-3 py-2 font-mono")} text-xs`}
          />

          {typing && !manualValid ? (
            <Result tone="bad" icon={<XCircle className="w-3.5 h-3.5" />} chip="INVALID">
              That isn&apos;t a valid address.
            </Result>
          ) : status === "noAccount" ? (
            <p className="text-[11px] text-ink/50">
              Enter a wallet address (or connect one) to preview whether it passes the gate.
            </p>
          ) : status === "loading" ? (
            <p className="flex items-center gap-1.5 text-xs font-mono text-ink/50">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> checking…
            </p>
          ) : status === "verified" ? (
            <Result tone="good" icon={<CheckCircle2 className="w-3.5 h-3.5" />} chip="VERIFIED">
              Passes the gate — verified until{" "}
              <span className="font-mono text-ink">{fmtUnixDateTime(verifiedUntil!)}</span>.
            </Result>
          ) : (
            <Result tone="bad" icon={<XCircle className="w-3.5 h-3.5" />} chip="NOT VERIFIED">
              This wallet is not verified in the registry — it can&apos;t claim until it verifies
              with zk-X509.
            </Result>
          )}
        </>
      )}
    </div>
  );
}

/** Chip + explanatory line for a resolved check; tone drives the accent. */
function Result({
  tone,
  icon,
  chip,
  children,
}: {
  tone: "good" | "bad";
  icon: React.ReactNode;
  chip: string;
  children: React.ReactNode;
}) {
  const chipTone = tone === "good" ? "bg-pop-mint" : "bg-pop-yellow";
  return (
    <div className="space-y-1.5">
      <span className={`${POP_CHIP} text-ink border-ink ${chipTone} inline-flex items-center gap-1.5`}>
        {icon} {chip}
      </span>
      <p className="text-[11px] text-ink/70 leading-relaxed">{children}</p>
    </div>
  );
}
