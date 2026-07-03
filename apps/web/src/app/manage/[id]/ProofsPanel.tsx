"use client";

import { useState } from "react";
import { useChainId, usePublicClient } from "wagmi";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Hex } from "viem";
import { buildPublishProofsRequest } from "@tokamak-network/scatter-drop-sdk";
import { CheckCircle2, CloudUpload, Loader2 } from "lucide-react";
import { TxButton } from "@/components/TxButton";
import { useDeployment } from "@/lib/contracts";
import { scanLatestProofsCid } from "@/lib/dropScan";
import { shortHash } from "@/lib/explorer";
import type { Campaign } from "@/lib/stub";
import { useWalletSession } from "@/lib/useWalletSession";

type ProofsMeta = { count: number; cid: string | null };

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
  const client = usePublicClient({ chainId });
  const { data: dep } = useDeployment();
  const queryClient = useQueryClient();
  const { ensureSession } = useWalletSession(
    "Sign in to scatter.drop to manage your campaign's proofs.",
  );
  const [repinning, setRepinning] = useState(false);
  const [repinError, setRepinError] = useState<string | null>(null);

  // Store status: published? how many recipients? pinned CID?
  const { data: meta, isPending: metaPending } = useQuery({
    queryKey: ["proofsMeta", root],
    enabled: !!root,
    queryFn: async (): Promise<ProofsMeta | null> => {
      const res = await fetch(`/api/proofs?root=${encodeURIComponent(root!)}&meta=1`, {
        cache: "no-store",
      });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error("Failed to load proofs status");
      return (await res.json()) as ProofsMeta;
    },
  });

  // The currently anchored CID (latest ProofsPublished event), if any.
  const { data: anchoredCid, isPending: anchorPending } = useQuery({
    queryKey: ["proofsAnchor", chainId, campaign.drop],
    enabled: !!client && !!dep,
    staleTime: 30_000,
    queryFn: () => scanLatestProofsCid(client!, dep!, campaign.drop),
  });

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
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-4 max-w-xl">
      <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 font-mono flex items-center gap-2">
        <CloudUpload className="w-4 h-4 text-emerald-500" />
        Recipient list durability
      </h3>
      <p className="text-sm text-slate-400 leading-relaxed">
        The recipient list lives in this app&apos;s store; pinning it to IPFS
        and anchoring the CID on-chain lets claimers recover it even if the
        store is unavailable.
      </p>

      {metaPending || anchorPending ? (
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <Loader2 className="w-4 h-4 animate-spin" /> Checking proofs status…
        </div>
      ) : !meta ? (
        <p className="text-xs text-amber-600">
          No recipient list is stored for this campaign — republish it from the
          creation flow first.
        </p>
      ) : (
        <>
          <dl className="text-xs space-y-1.5 font-mono">
            <div className="flex justify-between gap-4">
              <dt className="text-slate-500">Store</dt>
              <dd className="text-slate-200">
                {meta.count.toLocaleString()} recipients ✓
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-slate-500">IPFS pin</dt>
              <dd className="text-slate-200" title={cid ?? undefined}>
                {cid ? `${shortHash(cid)} ✓` : "not pinned"}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-slate-500">On-chain anchor</dt>
              <dd
                className={anchored ? "text-emerald-500" : "text-slate-200"}
                title={anchoredCid ?? undefined}
              >
                {anchored
                  ? "anchored ✓"
                  : anchoredCid
                    ? // CIDs are content-addressed — a mismatch only says the
                      // anchored content differs from the current pin, not
                      // which side is newer.
                      `${shortHash(anchoredCid)} (differs from pin)`
                    : "not anchored"}
              </dd>
            </div>
          </dl>

          {!isOperator ? (
            <p className="text-xs text-amber-600">
              Only the campaign operator can pin or anchor the list.
            </p>
          ) : (
            <div className="space-y-2">
              {!cid ? (
                <button
                  type="button"
                  onClick={repin}
                  disabled={repinning}
                  className="btn btn-primary text-xs"
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
                  className="btn text-xs"
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
                      queryKey: ["proofsAnchor", chainId, campaign.drop],
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
              {repinError && <p className="text-xs text-red-500">{repinError}</p>}
            </div>
          )}
        </>
      )}
    </div>
  );
}
