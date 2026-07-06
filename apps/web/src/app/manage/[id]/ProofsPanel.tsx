"use client";

import { useState } from "react";
import { useChainId } from "wagmi";
import { useQueryClient } from "@tanstack/react-query";
import type { Hex } from "viem";
import { buildPublishProofsRequest } from "@tokamak-network/scatter-drop-sdk";
import { CheckCircle2, CloudUpload, Loader2 } from "lucide-react";
import { inkBtnClass, POP_HEADING, POP_PANEL, whiteBtnClass } from "@/components/pop";
import { TxButton } from "@/components/TxButton";
import { useDeployment } from "@/lib/contracts";
import { shortHash } from "@/lib/explorer";
import {
  ipfsUrl,
  proofsAnchorQueryKey,
  useProofsAnchorCid,
  useProofsMeta,
  type ProofsMeta,
} from "@/lib/proofs";
import type { Campaign } from "@/lib/stub";
import { useWalletSession } from "@/lib/useWalletSession";

/**
 * Operator console — durability status of the campaign's recipient list and
 * the recovery actions: re-pin the stored proofs to IPFS (campaigns created
 * before pinning was configured, or whose original pin failed) and anchor the
 * CID on-chain (factory.publishProofs) so claimers can recover the list even
 * if this app's store is gone.
 */
export function ProofsPanel({
  campaign,
  isOperator,
}: {
  campaign: Campaign;
  isOperator: boolean;
}) {
  const root = campaign.merkleRoot?.toLowerCase() as Hex | undefined;
  const chainId = useChainId();
  const { data: dep, isLoading: depLoading } = useDeployment();
  const queryClient = useQueryClient();
  const { ensureSession } = useWalletSession(
    "Sign in to scatter.drop to manage your campaign's proofs.",
  );
  const [repinning, setRepinning] = useState(false);
  const [repinError, setRepinError] = useState<string | null>(null);

  // Store status: published? how many recipients? pinned CID? isLoading, not
  // isPending — a no-root campaign disables the query, which then stays
  // isPending forever (stuck spinner).
  const { data: meta, isLoading: metaLoading, isError: metaError } = useProofsMeta(campaign);

  // The currently anchored CID (latest ProofsPublished event), if any.
  const {
    data: anchoredCid,
    isLoading: anchorLoading,
    isError: anchorError,
  } = useProofsAnchorCid(campaign);

  const repin = async () => {
    setRepinError(null);
    setRepinning(true);
    try {
      const session = await ensureSession(campaign.operator);
      if (!session) {
        setRepinError("Sign-in was cancelled.");
        return;
      }
      const res = await fetch("/api/proofs/repin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chainId, drop: campaign.drop, root }),
      });
      const data = (await res.json()) as { cid?: string; error?: string };
      if (!res.ok || !data.cid) {
        setRepinError(data.error ?? "Re-pin failed");
        return;
      }
      // Update in place when cached; otherwise refetch rather than seeding a
      // possibly-wrong count.
      const prev = queryClient.getQueryData<ProofsMeta | null>(["proofsMeta", root]);
      if (prev) {
        queryClient.setQueryData(["proofsMeta", root], { ...prev, cid: data.cid! });
      } else {
        void queryClient.invalidateQueries({ queryKey: ["proofsMeta", root] });
      }
    } catch {
      setRepinError("Re-pin failed — please retry.");
    } finally {
      setRepinning(false);
    }
  };

  const cid = meta?.cid ?? null;
  const anchored = !!anchoredCid && anchoredCid === cid;

  return (
    <div className={`bg-white p-6 space-y-4 max-w-xl ${POP_PANEL}`}>
      <h3 className={`${POP_HEADING} flex items-center gap-2`}>
        <CloudUpload className="w-4 h-4 text-ink" />
        Recipient list durability
      </h3>
      <p className="text-sm text-ink/70 leading-relaxed">
        The recipient list lives in this app&apos;s store; pinning it to IPFS
        and anchoring the CID on-chain lets claimers recover it even if the
        store is unavailable.
      </p>

      {/* depLoading: the anchor query is disabled until the deployment
          resolves, and a disabled query isn't "loading" — without this the
          panel would flash "not anchored" before the scan ever ran. */}
      {metaLoading || anchorLoading || depLoading ? (
        <div className="flex items-center gap-2 text-xs text-ink/50">
          <Loader2 className="w-4 h-4 animate-spin" /> Checking proofs status…
        </div>
      ) : metaError || anchorError ? (
        // A fetch failure must not masquerade as "no recipient list stored".
        <p className="text-xs font-medium text-amber-600">
          Could not load proofs status — check the fork/RPC and retry.
        </p>
      ) : !meta ? (
        <p className="text-xs font-medium text-amber-600">
          No recipient list is stored for this campaign — republish it from the
          creation flow first.
        </p>
      ) : (
        <>
          <dl className="text-xs space-y-1.5 font-mono">
            <div className="flex justify-between gap-4">
              <dt className="text-ink/50">Store</dt>
              <dd className="text-ink">
                {meta.count.toLocaleString()} recipients ✓
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-ink/50">IPFS pin</dt>
              <dd className="text-ink">
                {cid ? (
                  <CidLink cid={cid} className="text-emerald-600">
                    {shortHash(cid)} ✓
                  </CidLink>
                ) : (
                  "not pinned"
                )}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-ink/50">On-chain anchor</dt>
              <dd className={anchored ? "text-emerald-600" : "text-ink"}>
                {anchoredCid ? (
                  <CidLink cid={anchoredCid}>
                    {anchored
                      ? "anchored ✓"
                      : // CIDs are content-addressed — a mismatch only says the
                        // anchored content differs from the current pin, not
                        // which side is newer.
                        `${shortHash(anchoredCid)} (differs from pin)`}
                  </CidLink>
                ) : (
                  "not anchored"
                )}
              </dd>
            </div>
          </dl>

          {!isOperator ? (
            <p className="text-xs font-medium text-amber-600">
              Only the campaign operator can pin or anchor the list.
            </p>
          ) : (
            <div className="space-y-2">
              {!cid ? (
                <button
                  type="button"
                  onClick={repin}
                  disabled={repinning}
                  className={`text-xs disabled:opacity-50 ${inkBtnClass("sm")}`}
                >
                  {repinning ? "Pinning…" : "Pin recipient list to IPFS"}
                </button>
              ) : (
                // Pins can lapse (unpinned/expired) while the stored CID
                // survives — keep re-pinning available; the server no-ops the
                // DB write when the CID is unchanged.
                <button
                  type="button"
                  onClick={repin}
                  disabled={repinning}
                  className={`text-xs disabled:opacity-50 ${whiteBtnClass("sm")}`}
                >
                  {repinning ? "Pinning…" : "Re-pin to IPFS"}
                </button>
              )}
              {cid && !anchored && dep && (
                <TxButton
                  request={buildPublishProofsRequest(dep.dropFactory, campaign.drop, cid)}
                  label="Publish proofs CID on-chain"
                  primary
                  disableWhenConfirmed
                  onConfirmed={() => {
                    void queryClient.invalidateQueries({
                      queryKey: proofsAnchorQueryKey(chainId, campaign.drop),
                    });
                  }}
                />
              )}
              {cid && anchored && (
                <p className="text-xs text-emerald-600 flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Fully durable — pinned to IPFS and anchored on-chain.
                </p>
              )}
              {repinError && <p className="text-xs text-rose-500">{repinError}</p>}
            </div>
          )}
        </>
      )}
    </div>
  );
}

/** Gateway link for a CID row — one home for the ↗ affordance and rel/title. */
function CidLink({
  cid,
  className = "",
  children,
}: {
  cid: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <a
      href={ipfsUrl(cid)}
      target="_blank"
      rel="noopener noreferrer"
      className={`hover:underline ${className}`}
      title={`Open proofs.json (${cid}) on the IPFS gateway`}
    >
      {children} ↗
    </a>
  );
}
