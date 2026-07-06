"use client";

import { use } from "react";
import Link from "next/link";
import { useAccount, useChainId, useChains } from "wagmi";
import { formatUnits } from "viem";
import { ConnectGate } from "@/components/ConnectGate";
import { DescriptionList } from "@/components/ui";
import { EmptyState, Loading } from "@/components/states";
import { ReportActions } from "@/components/ReportActions";
import { fmtUnixDateTime, useCampaign, useClaimEvents } from "@/lib/campaigns";
import { receiptCsv, type ClaimReceipt } from "@/lib/reports";

export default function ClaimReceiptPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { address } = useAccount();
  const chainId = useChainId();
  const chains = useChains();
  // Live receipt: the wallet's Claimed event on this campaign — the same
  // sources the operator's distribution report uses (no stub, no store).
  const { data: campaign, isLoading: campaignLoading, isError: campaignError } =
    useCampaign(id);
  const {
    data: claims,
    isLoading: claimsLoading,
    isError: claimsError,
  } = useClaimEvents(campaign ?? undefined);
  const isLoading = campaignLoading || claimsLoading;
  const isError = campaignError || claimsError;
  const mine = address
    ? claims?.find((c) => c.account === address.toLowerCase())
    : undefined;
  const receipt: ClaimReceipt | null =
    campaign && mine
      ? {
          campaignId: campaign.id,
          campaignName: campaign.name,
          token: campaign.token,
          amount: `${formatUnits(mine.amount, campaign.decimals ?? 18)} ${campaign.tokenSymbol}`,
          // timestamp 0 = block time not resolved (capped scan) — show the tx instead.
          claimedAt: mine.timestamp ? fmtUnixDateTime(BigInt(mine.timestamp)) : "—",
          tx: mine.txHash,
          chain:
            chains.find((c) => c.id === chainId)?.name ?? `chainId ${chainId}`,
        }
      : null;

  return (
    <div className="print-doc">
      <div className="no-print" style={{ marginBottom: 16 }}>
        <Link href={`/c/${id}`} className="muted">
          ← Back to campaign
        </Link>
      </div>

      <h1 style={{ margin: "0 0 16px" }}>Claim receipt</h1>

      <ConnectGate prompt="Connect a wallet to view your claim receipt.">
        {isLoading ? (
          <Loading label="Loading receipt…" />
        ) : isError ? (
          // Distinguish an RPC/indexing outage from a genuine "no claim" —
          // otherwise a fork hiccup reads as "you never claimed".
          <EmptyState
            title="Couldn't load the receipt"
            description="The campaign or its claim history couldn't be read — check the network and retry."
            action={{ href: `/c/${id}`, label: "Back to campaign" }}
          />
        ) : !receipt ? (
          <EmptyState
            title="No receipt found"
            description="No claim on record for this wallet on this campaign."
            action={{ href: `/c/${id}`, label: "Back to campaign" }}
          />
        ) : (
          <div className="card">
            <DescriptionList
              items={[
                { label: "Campaign", value: receipt.campaignName },
                { label: "Token", value: receipt.token },
                { label: "Amount", value: receipt.amount },
                { label: "Claimed at", value: receipt.claimedAt },
                { label: "Tx", value: receipt.tx },
                { label: "Chain", value: receipt.chain },
              ]}
            />
            <div style={{ marginTop: 16 }}>
              <ReportActions
                csv={receiptCsv(receipt)}
                filename={`receipt-${id}.csv`}
              />
            </div>
            <p className="muted" style={{ fontSize: 12, marginTop: 16 }}>
              Self-claim record for tax filing. Stub data — live claim lookup
              lands in M5.
            </p>
          </div>
        )}
      </ConnectGate>
    </div>
  );
}
