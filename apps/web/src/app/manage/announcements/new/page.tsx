"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAccount, useChainId, useChains } from "wagmi";
import { isAddress, type Address } from "viem";
import { ArrowLeft, Loader2, Megaphone, Plus, Trash2 } from "lucide-react";
import { ConnectGate } from "@/components/ConnectGate";
import { NetworkPills } from "@/components/NetworkSelect";
import { inkBtnClass, POP_LABEL, POP_PANEL, popInputClass } from "@/components/pop";
import { useErc20Name, useErc20Symbol } from "@/lib/contracts";
import {
  createAnnouncement,
  type AnnouncementLink,
} from "@/lib/announcements";
import {
  LINK_URL_RE,
  MAX_BODY,
  MAX_LINK_LABEL,
  MAX_LINK_URL,
  MAX_LINKS,
  MAX_SYMBOL,
  MAX_TITLE,
} from "@/lib/announcementLimits";
import { useWalletSession } from "@/lib/useWalletSession";

const inputCls = popInputClass("px-3 py-2 rounded-xl");
const labelCls = POP_LABEL;

/**
 * Post an "Upcoming Drops" announcement. The first submit prompts a SIWE
 * signature — announcements are public, so posts must come from a verified
 * wallet (that wallet later links the created campaign in the wizard).
 */
export default function NewAnnouncementPage() {
  const router = useRouter();
  const walletChainId = useChainId();
  const chains = useChains();
  const { address } = useAccount();
  const { me, ensureSession, busy } = useWalletSession(
    "Sign in to scatter.drop to manage your announcements.",
  );

  // Form-local network choice — null means "follow the wallet's chain". A
  // SIWE post is chain-agnostic, so the operator may announce for any
  // registered network without switching the wallet.
  const [selectedChainId, setSelectedChainId] = useState<number | null>(null);
  const chainId = selectedChainId ?? walletChainId;

  const [title, setTitle] = useState("");
  const [tokenAddress, setTokenAddress] = useState("");
  const [body, setBody] = useState("");
  const [expectedStart, setExpectedStart] = useState("");
  const [expectedEnd, setExpectedEnd] = useState("");
  const [links, setLinks] = useState<AnnouncementLink[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Browsers without a datetime-local picker fall back to free text, so an
  // unparseable value must fail validation instead of throwing in toISOString.
  const toIso = (v: string) => {
    const ms = Date.parse(v);
    return Number.isNaN(ms) ? "" : new Date(ms).toISOString();
  };
  const startMs = Date.parse(expectedStart);
  const endMs = expectedEnd ? Date.parse(expectedEnd) : null;
  // Optional field, but when present it must be a real address — the server
  // rejects anything else, so catch it before the SIWE prompt.
  const trimmedTokenAddress = tokenAddress.trim();
  const tokenAddressValid = trimmedTokenAddress === "" || isAddress(trimmedTokenAddress);
  const hasTokenAddress = trimmedTokenAddress !== "" && tokenAddressValid;

  // Live ERC-20 lookup on the SELECTED network once the address parses —
  // instant feedback that the pasted contract is the intended token, and the
  // announcement's symbol (no manual symbol field: the resolved one is used).
  // Intermediate keystrokes fail isAddress, so the hooks' enabled guard is
  // the debounce.
  const lookupToken = hasTokenAddress ? (trimmedTokenAddress as Address) : undefined;
  const { data: tokenName, isPending: namePending } = useErc20Name(lookupToken, chainId);
  const { data: liveSymbol, isPending: symbolPending } = useErc20Symbol(lookupToken, chainId);

  // Block submit while a lookup is in flight — posting mid-resolution would
  // race the symbol to undefined even though the address will resolve.
  const resolving = hasTokenAddress && (namePending || symbolPending);

  const valid =
    title.trim() !== "" &&
    body.trim() !== "" &&
    tokenAddressValid &&
    !resolving &&
    !Number.isNaN(startMs) &&
    (endMs === null || endMs > startMs) &&
    links.every((l) => l.label.trim() && LINK_URL_RE.test(l.url));

  const setLink = (i: number, patch: Partial<AnnouncementLink>) =>
    setLinks((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  const submit = async () => {
    setError(null);
    // Session must belong to the connected wallet — a stale session for a
    // previous wallet would attribute the post to the wrong operator.
    if (!(await ensureSession(address))) return;
    setSaving(true);
    try {
      const res = await createAnnouncement({
        chainId,
        title: title.trim(),
        body: body.trim(),
        // The resolved on-chain symbol (trimmed/capped like manual entry used
        // to be); no address or no symbol() on the contract → omitted. Gated
        // on hasTokenAddress: the query cache keeps the previous address's
        // symbol alive after the field is cleared.
        tokenSymbol:
          hasTokenAddress && liveSymbol
            ? liveSymbol.trim().slice(0, MAX_SYMBOL) || undefined
            : undefined,
        tokenAddress: trimmedTokenAddress || undefined,
        expectedStart: toIso(expectedStart),
        expectedEnd: expectedEnd ? toIso(expectedEnd) : undefined,
        links: links.length ? links : undefined,
      });
      if (res.error || !res.announcement) setError(res.error ?? "Failed to post");
      else router.push(`/upcoming/${res.announcement.id}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6 animate-fade-in">
      <Link
        href="/manage"
        className="inline-flex items-center gap-1.5 text-xs font-bold text-ink/60 hover:text-ink transition"
      >
        <ArrowLeft className="w-3.5 h-3.5" /> Manage
      </Link>

      <div>
        <h1 className="font-chunk uppercase text-2xl md:text-3xl tracking-tight text-ink flex items-center gap-2">
          <Megaphone className="w-6 h-6 text-ink" /> New announcement
        </h1>
        <p className="text-xs text-ink/60 font-medium mt-1">
          Tease your drop on the Upcoming board before it goes on-chain. You can
          link the live campaign later from the creation wizard.
        </p>
      </div>

      <ConnectGate prompt="Connect the wallet that will operate the drop.">
        {/* Form-local network choice (not a wallet switch): a SIWE post works
            for any registered chain. The board lists the WALLET's chain, so a
            mismatch is flagged instead of hidden. */}
        <NetworkPills
          chains={chains}
          activeId={chainId}
          onSelect={setSelectedChainId}
          title={(c, active) =>
            active ? "Announcing on this network" : `Announce on ${c.name}`
          }
        >
          {chainId !== walletChainId && (
            <span className="text-[11px] font-medium text-amber-600">
              Differs from your wallet&apos;s network — the Upcoming board shows
              the wallet&apos;s chain, so switch there to see the post listed.{" "}
              <button
                type="button"
                onClick={() => setSelectedChainId(null)}
                className="underline hover:text-ink transition"
              >
                Use wallet network
              </button>
            </span>
          )}
        </NetworkPills>

        <div className={`bg-white p-6 space-y-5 ${POP_PANEL}`}>
          <div>
            <label htmlFor="ann-title" className={labelCls}>
              Title *
            </label>
            <input
              id="ann-title"
              className={inputCls}
              maxLength={MAX_TITLE}
              placeholder="ACME loyalty airdrop — season 2"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div>
            <label htmlFor="ann-token-address" className={labelCls}>
              Token address
            </label>
            <input
              id="ann-token-address"
              className={`${inputCls} font-mono ${
                tokenAddressValid ? "" : "border-rose-400 focus:border-rose-400"
              }`}
              // No maxLength: it would truncate pasted addresses that carry
              // leading whitespace BEFORE the trim; isAddress gates submit.
              placeholder="0x… (the airdropped ERC-20, if already deployed)"
              value={tokenAddress}
              onChange={(e) => setTokenAddress(e.target.value)}
            />
            {!tokenAddressValid && (
              <p className="text-[11px] text-rose-500 mt-1">
                Not a valid address — leave empty if the token isn&apos;t deployed yet.
              </p>
            )}
            {hasTokenAddress &&
              (namePending || symbolPending ? (
                <p className="text-[11px] text-ink/50 mt-1 flex items-center gap-1.5">
                  <Loader2 className="w-3 h-3 animate-spin" /> Resolving token…
                </p>
              ) : tokenName || liveSymbol ? (
                // Tolerate partial ERC-20s — either read alone still
                // confirms a token lives at the address. The symbol shown
                // here is what the announcement will carry.
                <p className="text-[11px] font-bold text-emerald-600 mt-1">
                  ✓ {[tokenName, liveSymbol && `(${liveSymbol})`].filter(Boolean).join(" ")}
                </p>
              ) : (
                <p className="text-[11px] font-medium text-amber-600 mt-1">
                  Could not resolve an ERC-20 at this address on{" "}
                  {chains.find((c) => c.id === chainId)?.name ?? `chain ${chainId}`}.
                </p>
              ))}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="ann-start" className={labelCls}>
                Expected start *
              </label>
              <input
                id="ann-start"
                type="datetime-local"
                className={inputCls}
                value={expectedStart}
                onChange={(e) => setExpectedStart(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="ann-end" className={labelCls}>
                Expected end
              </label>
              <input
                id="ann-end"
                type="datetime-local"
                className={inputCls}
                value={expectedEnd}
                onChange={(e) => setExpectedEnd(e.target.value)}
              />
            </div>
          </div>

          <div>
            <label htmlFor="ann-body" className={labelCls}>
              Details *
            </label>
            <textarea
              id="ann-body"
              className={`${inputCls} min-h-32 resize-y`}
              maxLength={MAX_BODY}
              placeholder="Who is eligible, how amounts are decided, what to prepare…"
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
            <p className="text-[10px] text-ink/50 mt-1">
              Markdown supported — headings, lists, links, **bold**.
            </p>
          </div>

          <div className="space-y-2">
            <span className={labelCls}>Links (site, X, docs — max {MAX_LINKS})</span>
            {links.map((l, i) => (
              // Index keys are fine here: rows are only appended/removed in place.
              // eslint-disable-next-line react/no-array-index-key
              <div key={i} className="flex gap-2">
                <input
                  aria-label={`Link ${i + 1} label`}
                  className={`${inputCls} basis-1/3`}
                  maxLength={MAX_LINK_LABEL}
                  placeholder="Website"
                  value={l.label}
                  onChange={(e) => setLink(i, { label: e.target.value })}
                />
                <input
                  aria-label={`Link ${i + 1} URL`}
                  className={inputCls}
                  maxLength={MAX_LINK_URL}
                  placeholder="https://…"
                  value={l.url}
                  onChange={(e) => setLink(i, { url: e.target.value })}
                />
                <button
                  type="button"
                  aria-label={`Remove link ${i + 1}`}
                  onClick={() => setLinks((ls) => ls.filter((_, j) => j !== i))}
                  className="shrink-0 px-2 text-ink/40 hover:text-rose-500 transition"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
            {links.length < MAX_LINKS && (
              <button
                type="button"
                onClick={() => setLinks((ls) => [...ls, { label: "", url: "" }])}
                className="inline-flex items-center gap-1.5 text-xs font-bold text-ink/60 hover:text-ink transition"
              >
                <Plus className="w-3.5 h-3.5" /> Add link
              </button>
            )}
          </div>

          <div className="pt-3 border-t-2 border-ink/10 space-y-3">
            {error && <p className="text-[11px] text-rose-500">{error}</p>}
            <button
              type="button"
              onClick={() => void submit()}
              disabled={!valid || busy || saving}
              className={`w-full flex items-center justify-center gap-2 text-sm disabled:opacity-50 ${inkBtnClass("lg")}`}
            >
              {busy || saving ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : me.address ? (
                "Post announcement"
              ) : (
                "Sign in & post announcement"
              )}
            </button>
            <p className="text-[10px] text-ink/50 leading-snug">
              Posting requires a one-time wallet signature (SIWE) so the board
              can attribute announcements to a verified operator.
            </p>
          </div>
        </div>
      </ConnectGate>
    </div>
  );
}
