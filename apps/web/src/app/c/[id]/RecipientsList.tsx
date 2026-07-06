"use client";

import { useMemo, useState } from "react";
import { useAccount } from "wagmi";
import { formatUnits } from "viem";
import { Download, ListChecks, Loader2, Search } from "lucide-react";
import type { Campaign } from "@/lib/stub";
import { popInputClass, POP_PANEL, whiteBtnClass } from "@/components/pop";
import { useRecipients, type RecipientRow } from "@/lib/proofs";
import { downloadCsv } from "@/lib/download";

/**
 * The campaign's public distribution list (campaign detail, left column) — a
 * pure directory/audit surface: browse, search, CSV export, with the
 * connected wallet's row highlighted. The eligibility *verdict* is owned by
 * ClaimPanel (it's stub-aware); this component deliberately makes no
 * eligibility claims so the two can't contradict.
 */
export function RecipientsList({ campaign }: { campaign: Campaign }) {
  const { data: rows, isPending, isError } = useRecipients(campaign);
  const { address } = useAccount();
  const [query, setQuery] = useState("");

  // Searching is the primary interaction (nobody scrolls 4,549 rows) — cap
  // what's rendered and let the CSV carry the full list.
  const DISPLAY_CAP = 100;
  const decimals = campaign.decimals ?? 18;
  const fmt = (r: RecipientRow) =>
    `${formatUnits(r.amount, decimals)} ${campaign.tokenSymbol}`;

  const me = address?.toLowerCase();
  const trimmedQuery = query.trim().toLowerCase();
  const filtered = useMemo(
    () =>
      rows && trimmedQuery
        ? rows.filter((r) => r.address.includes(trimmedQuery))
        : rows ?? [],
    [rows, trimmedQuery],
  );
  const shown = filtered.slice(0, DISPLAY_CAP);

  const exportCsv = () => {
    if (!rows) return;
    const csv = rows.map((r) => `${r.address},${formatUnits(r.amount, decimals)}`).join("\n");
    downloadCsv(`recipients-${campaign.drop}.csv`, `address,amount\n${csv}`);
  };

  return (
    <div className={`bg-white p-6 md:p-8 space-y-4 ${POP_PANEL}`}>
      <div className="flex items-center justify-between border-b border-ink/10 pb-4">
        <h3 className="text-sm font-bold uppercase tracking-wider text-ink font-mono flex items-center gap-2">
          <ListChecks className="w-4 h-4 text-ink" />
          Recipients
          {rows && (
            <span className="text-ink/50 normal-case tracking-normal">
              ({rows.length.toLocaleString()})
            </span>
          )}
        </h3>
        {rows && (
          <button
            type="button"
            onClick={exportCsv}
            className={`inline-flex items-center gap-1.5 text-[11px] ${whiteBtnClass("sm")}`}
          >
            <Download className="w-3 h-3" /> CSV
          </button>
        )}
      </div>

      {!campaign.merkleRoot ? (
        // No root (stub campaigns) → the query never runs; without this
        // branch the section would sit on the loading spinner forever.
        <p className="text-xs text-ink/50">
          No recipient list is available for this campaign.
        </p>
      ) : isPending ? (
        <div className="flex items-center gap-2 text-xs text-ink/50">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading recipient list…
        </div>
      ) : isError ? (
        <p className="text-xs text-ink/50">Could not load the recipient list.</p>
      ) : rows === null ? (
        <p className="text-xs text-ink/60 leading-relaxed">
          The operator hasn&apos;t published this campaign&apos;s recipient
          list yet — there&apos;s nothing to browse here.
        </p>
      ) : (
        <>
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-ink/40 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search an address (0x…)"
              className={popInputClass("pl-9 pr-4 py-2 font-mono rounded-full")}
            />
          </div>
          {shown.length === 0 ? (
            <p className="text-xs text-ink/50">No address matches that search.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[11px] font-mono">
                <thead>
                  <tr className="text-left text-ink/50">
                    <th className="py-1.5 pr-4 font-semibold">Address</th>
                    <th className="py-1.5 text-right font-semibold">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((r) => (
                    <tr
                      key={r.address}
                      className={
                        r.address === me
                          ? "text-ink font-bold bg-pop-mint/40 border-t border-ink/10"
                          : "text-ink/80 border-t border-ink/10"
                      }
                    >
                      <td className="py-1.5 pr-4 truncate max-w-0 w-full select-all">
                        {r.address}
                      </td>
                      <td className="py-1.5 text-right whitespace-nowrap">{fmt(r)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {filtered.length > DISPLAY_CAP && (
            <p className="text-[11px] text-ink/50">
              Showing first {DISPLAY_CAP} of {filtered.length.toLocaleString()} — search to
              narrow, or export the CSV for the full list.
            </p>
          )}
        </>
      )}
    </div>
  );
}
