"use client";

import { useRef, useState } from "react";
import { useChainId } from "wagmi";
import { useQueryClient } from "@tanstack/react-query";
import type { Hex } from "viem";
import { CheckCircle2, Upload } from "lucide-react";
import { inkBtnClass, popInputClass, whiteBtnClass } from "@/components/pop";
import { readCsvFileInput } from "@/lib/csvFile";
import { shortHash } from "@/lib/explorer";
import { proofsMetaQueryKey, proofsQueryKey, publishProofs } from "@/lib/proofs";
import type { Campaign } from "@/lib/stub";
import { useParsedRecipients } from "@/lib/useParsedRecipients";
import { useWalletSession } from "@/lib/useWalletSession";

/**
 * Post-hoc recipient-list publishing for a campaign whose proofs store is
 * empty (script-created drops, a failed wizard publish, a wiped store). The
 * operator re-uploads the recipients CSV; the drop is rebuilt client-side
 * (the same parse + Merkle build as the wizard) and its root must reproduce
 * the campaign's on-chain merkleRoot before the publish button unlocks — a
 * mismatched list can't be stored, only the one the drop committed to.
 */
export function RepublishSection({
  campaign,
  root,
  decimals,
}: {
  campaign: Campaign;
  root: Hex;
  decimals: number;
}) {
  const chainId = useChainId();
  const queryClient = useQueryClient();
  const { ensureSession } = useWalletSession(
    "Sign in to scatter.drop to manage your campaign's proofs.",
  );
  const [csv, setCsv] = useState("");
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const { manifest, error: parseError } = useParsedRecipients(csv, decimals);
  const rootMatches = !!manifest && manifest.merkleRoot.toLowerCase() === root;

  const publish = async () => {
    if (!manifest || !rootMatches) return;
    setPublishError(null);
    setPublishing(true);
    try {
      const session = await ensureSession(campaign.operator);
      if (!session) {
        setPublishError("Sign-in was cancelled.");
        return;
      }
      const result = await publishProofs(
        chainId,
        campaign.drop,
        root,
        manifest.claims,
        campaign.creationTx,
      );
      if (!result.ok) {
        setPublishError(result.error);
        return;
      }
      // The store now has the list: refresh the panel's status AND the shared
      // claims cache (eligibility/recipients may have cached the pre-publish
      // "not published" verdict).
      void queryClient.invalidateQueries({
        queryKey: proofsMetaQueryKey(chainId, campaign.drop),
      });
      void queryClient.invalidateQueries({
        queryKey: proofsQueryKey(chainId, campaign.drop),
      });
    } finally {
      setPublishing(false);
    }
  };

  return (
    <div className="space-y-3">
      <p className="text-xs font-medium text-amber-600">
        No recipient list is stored for this campaign — claimers can&apos;t look
        up their proofs. Re-upload the recipients CSV to publish it now.
      </p>
      <textarea
        value={csv}
        onChange={(e) => setCsv(e.target.value)}
        rows={5}
        spellCheck={false}
        placeholder={"address,amount\n0xabc…,1000\n0xdef…,250.5"}
        className={popInputClass("w-full font-mono text-xs resize-y")}
      />
      <div className="flex items-center gap-3">
        <input
          ref={fileRef}
          type="file"
          accept=".csv,text/csv,text/plain"
          onChange={(e) => readCsvFileInput(e, setCsv)}
          className="hidden"
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className={`text-xs ${whiteBtnClass("sm")}`}
        >
          <Upload className="w-3.5 h-3.5 inline-block mr-1.5 -mt-0.5" />
          Upload CSV
        </button>
        <span className="text-[11px] text-ink/50">
          Amounts in token units ({decimals} decimals applied), same file the
          drop was created from.
        </span>
      </div>

      {parseError ? (
        <p className="text-xs text-rose-500">{parseError}</p>
      ) : !manifest ? null : rootMatches ? (
        <p className="text-xs text-emerald-600 flex items-center gap-1.5">
          <CheckCircle2 className="w-3.5 h-3.5" />
          {manifest.count.toLocaleString()} recipients — rebuilt root matches
          the on-chain commitment.
        </p>
      ) : (
        // Content-addressed check: the rebuilt tree's root IS the list's
        // identity, so a mismatch means this CSV is not the committed list
        // (edited amounts, missing rows, wrong decimals or file).
        <p className="text-xs text-rose-500">
          This CSV rebuilds to root {shortHash(manifest.merkleRoot)}, but the
          drop committed to {shortHash(root)} — it isn&apos;t the exact list
          this campaign was created with.
        </p>
      )}

      <button
        type="button"
        onClick={publish}
        disabled={!rootMatches || publishing}
        className={`text-xs disabled:opacity-50 ${inkBtnClass("sm")}`}
      >
        {publishing ? "Publishing…" : "Publish recipient list"}
      </button>
      {publishError && <p className="text-xs text-rose-500">{publishError}</p>}
    </div>
  );
}
