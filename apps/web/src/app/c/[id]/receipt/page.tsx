"use client";

import { use } from "react";
import Link from "next/link";
import { useAccount } from "wagmi";
import { useQuery } from "@tanstack/react-query";
import { ConnectGate } from "@/components/ConnectGate";
import { DescriptionList } from "@/components/ui";
import { EmptyState, Loading } from "@/components/states";
import { ReportActions } from "@/components/ReportActions";
import { getClaimReceipt, receiptCsv } from "@/lib/reports";

export default function ClaimReceiptPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { address } = useAccount();
  const { data: receipt, isLoading } = useQuery({
    queryKey: ["receipt", id, address],
    queryFn: () => getClaimReceipt(id, address),
    enabled: !!address,
  });

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
