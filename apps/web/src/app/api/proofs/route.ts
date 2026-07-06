import { NextResponse, type NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { verifyClaim, type ClaimProof } from "@tokamak-network/scatter-drop-sdk";
import type { Hex } from "viem";
import { prisma } from "@/lib/db";
import { isChainId, LOWER_ADDR_RE, ROOT_RE } from "@/lib/server/apiInput";
import { verifyDropOperator } from "@/lib/server/dropVerify";
import { pinJson } from "@/lib/server/pinning";
import { requireWallet } from "@/lib/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Proofs store keyed by the vault `(chainId, drop)`. This is the off-chain
 * proofs.json seam (DESIGN §8.7/§12): a campaign publishes its per-recipient
 * `claims` here and the claim page reads them back to find a wallet's proof.
 *
 * Persisted in the app DB (CampaignProofs) so a dev-server restart no longer
 * wipes eligibility for every campaign. Still a stand-in for IPFS pinning
 * (Filebase/Pinata) + the on-chain proofsCid; swap the backend later — the
 * client contract ((chainId, drop) → claims, cross-checked against the
 * vault's on-chain root) stays the same.
 */

// Bound storage: this is an untrusted, unauthenticated store (a stand-in for
// IPFS). Cap claims per root and total roots to limit DoS surface.
const MAX_CLAIMS = 50_000;
const MAX_ROOTS = 100;
// Hard ceiling on the stored blob (~64 MB at 50k claims of ~1.2 KB each) so a
// single unauthenticated POST can't stuff an unbounded string into SQLite.
const MAX_CLAIMS_BYTES = 64 * 1024 * 1024;

/** One claim's shape, mirroring the client's isValidClaim — reject junk values. */
function isValidClaim(c: unknown): c is ClaimProof {
  if (!c || typeof c !== "object") return false;
  const x = c as Record<string, unknown>;
  return (
    Number.isInteger(x.index) &&
    (x.index as number) >= 0 &&
    typeof x.account === "string" &&
    /^0x[0-9a-fA-F]{40}$/.test(x.account) &&
    typeof x.amount === "string" &&
    /^\d{1,78}$/.test(x.amount) &&
    Array.isArray(x.proof) &&
    x.proof.length <= 64 &&
    x.proof.every((p) => typeof p === "string" && /^0x[0-9a-fA-F]{64}$/.test(p))
  );
}

export async function POST(req: NextRequest) {
  // Operator-authenticated (SIWE + on-chain DropCreated ownership), like repin.
  // Without this the store was an open write: an attacker could fill the
  // MAX_ROOTS cap with self-consistent 1-leaf roots (availability DoS) or, now
  // that rows are keyed by (chainId, drop), squat a victim's slot before they
  // publish. Requiring the drop's operator closes both.
  const wallet = await requireWallet();
  if (!wallet) {
    return NextResponse.json({ error: "Sign-in required" }, { status: 401 });
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  // req.json() accepts the literal `null` (and other non-objects) — guard so
  // `b.chainId` can't throw a 500 on a hostile body.
  if (typeof body !== "object" || body === null) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const b = body as {
    chainId?: unknown;
    drop?: unknown;
    root?: unknown;
    txHash?: unknown;
    claims?: unknown;
  };
  const chainId = isChainId(b.chainId) ? b.chainId : null;
  const drop = typeof b.drop === "string" ? b.drop.toLowerCase() : null;
  const root = typeof b.root === "string" ? b.root.toLowerCase() : null;
  if (!chainId) return NextResponse.json({ error: "Invalid chainId" }, { status: 400 });
  if (!drop || !LOWER_ADDR_RE.test(drop)) {
    return NextResponse.json({ error: "Invalid drop address" }, { status: 400 });
  }
  if (!root || !ROOT_RE.test(root)) {
    return NextResponse.json({ error: "Invalid merkleRoot" }, { status: 400 });
  }
  // Prove the signed-in wallet is the drop's operator AND that `root` is the
  // drop's own on-chain merkleRoot (verifyDropOperator binds both) before
  // writing this (chainId, drop) row.
  const rejection = await verifyDropOperator(chainId, drop, wallet, b.txHash, root);
  if (rejection) return NextResponse.json({ error: rejection }, { status: 422 });
  // Reject arrays (typeof [] === "object") and non-objects.
  if (typeof b.claims !== "object" || b.claims === null || Array.isArray(b.claims)) {
    return NextResponse.json({ error: "Invalid claims" }, { status: 400 });
  }
  if ((await prisma.campaignProofs.count()) >= MAX_ROOTS) {
    return NextResponse.json({ error: "Proofs store is full" }, { status: 507 });
  }
  const entries = Object.entries(b.claims as Record<string, unknown>);
  if (entries.length > MAX_CLAIMS) {
    return NextResponse.json({ error: `Too many claims (max ${MAX_CLAIMS})` }, { status: 400 });
  }
  // Null-prototype object + address-only keys: blocks prototype pollution
  // (__proto__/constructor aren't valid addresses) and junk keys. Each value
  // must be a well-formed claim whose account matches its key AND that
  // merkle-verifies against `root` — defense in depth on top of the operator
  // auth above, so even the real operator can't store a list that doesn't
  // hash to the drop's committed root.
  const norm: Record<string, ClaimProof> = Object.create(null);
  for (const [k, v] of entries) {
    const key = k.toLowerCase();
    if (!LOWER_ADDR_RE.test(key)) continue;
    // isValidClaim already bounds index/amount, so verifyClaim's leaf encoding
    // can't throw on range — but keep it in the guard: an uncaught throw here
    // would 500 and leak a claim-shape oracle on this unauthenticated route.
    let ok = false;
    try {
      ok = isValidClaim(v) && v.account.toLowerCase() === key && verifyClaim(root as Hex, v);
    } catch {
      ok = false;
    }
    if (!ok) {
      return NextResponse.json(
        { error: `Claim for ${key} is malformed or does not verify against the merkle root` },
        { status: 400 },
      );
    }
    norm[key] = v as ClaimProof;
  }
  const count = Object.keys(norm).length;
  // All keys were junk → nothing claimable; storing it would only let junk
  // rows fill the MAX_ROOTS cap.
  if (count === 0) {
    return NextResponse.json({ error: "No valid claims" }, { status: 400 });
  }
  const serialized = JSON.stringify(norm);
  // Byte length as stored (UTF-8), not UTF-16 code units — .length would
  // undercount multi-byte data and weaken the ceiling.
  if (Buffer.byteLength(serialized, "utf8") > MAX_CLAIMS_BYTES) {
    return NextResponse.json({ error: "Claims payload too large" }, { status: 413 });
  }
  try {
    await prisma.campaignProofs.create({
      data: { chainId, drop, root, claims: serialized, count },
    });
  } catch (err) {
    // Unique violation — proofs are immutable per (chainId, drop), so a second
    // publish for the SAME vault is rejected rather than overwriting. A
    // different vault sharing this root gets its own row (no squat). Anything
    // else is a real DB failure, not a conflict.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return NextResponse.json(
        { error: "Proofs already published for this campaign" },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
  // Best-effort IPFS pin after the durable store: the CID lets the operator
  // anchor the list on-chain (publishProofs) and lets clients recover it when
  // this store is unavailable. A pinning failure must not fail the publish.
  // The pinned JSON is self-describing (chainId + drop + root) so a CID names
  // the exact vault it belongs to, not just an ownerless recipient list.
  let cid: string | null = null;
  try {
    cid = await pinJson(`proofs-${chainId}-${drop}.json`, { chainId, drop, root, claims: norm });
    if (cid) {
      await prisma.campaignProofs.update({
        where: { chainId_drop: { chainId, drop } },
        data: { cid },
      });
    }
  } catch {
    cid = null;
  }
  return NextResponse.json({ ok: true, count, cid });
}

export async function GET(req: NextRequest) {
  const chainId = Number(req.nextUrl.searchParams.get("chainId"));
  const drop = req.nextUrl.searchParams.get("drop")?.toLowerCase();
  if (!isChainId(chainId) || !drop || !LOWER_ADDR_RE.test(drop)) {
    return NextResponse.json({ error: "chainId and drop query required" }, { status: 400 });
  }
  const where = { chainId_drop: { chainId, drop } };
  // ?meta=1 → status only (count + cid), skipping the multi-MB claims body —
  // for surfaces like the operator console that only need "is it published?".
  const metaOnly = req.nextUrl.searchParams.get("meta") === "1";
  if (metaOnly) {
    const meta = await prisma.campaignProofs.findUnique({
      where,
      select: { count: true, cid: true },
    });
    if (!meta) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json(meta);
  }
  const row = await prisma.campaignProofs.findUnique({ where });
  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });
  // The stored claims are JSON text we wrote ourselves — embed the string
  // directly instead of parse + re-stringify (up to MAX_CLAIMS entries on the
  // eligibility hot path). root lets the client cross-check the stored list
  // against the vault's on-chain root; cid rides along for anchor surfaces.
  return new NextResponse(
    `{"root":${JSON.stringify(row.root)},"claims":${row.claims},"cid":${JSON.stringify(row.cid)}}`,
    { headers: { "content-type": "application/json" } },
  );
}
