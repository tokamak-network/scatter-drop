import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { LOWER_ADDR_RE, ROOT_RE } from "@/lib/server/apiInput";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Proofs store keyed by the campaign's `merkleRoot`. This is the off-chain
 * proofs.json seam (DESIGN §8.7/§12): a campaign publishes its per-recipient
 * `claims` here and the claim page reads them back to find a wallet's proof.
 *
 * Persisted in the app DB (CampaignProofs) so a dev-server restart no longer
 * wipes eligibility for every campaign. Still a stand-in for IPFS pinning
 * (Filebase/Pinata) + the on-chain proofsCid; swap the backend later — the
 * client contract (root → claims) stays the same.
 */

// Bound storage: this is an untrusted, unauthenticated store (a stand-in for
// IPFS). Cap claims per root and total roots to limit DoS surface.
const MAX_CLAIMS = 50_000;
const MAX_ROOTS = 100;

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const b = body as { root?: unknown; claims?: unknown };
  const root = typeof b.root === "string" ? b.root.toLowerCase() : null;
  if (!root || !ROOT_RE.test(root)) {
    return NextResponse.json({ error: "Invalid merkleRoot" }, { status: 400 });
  }
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
  // (__proto__/constructor aren't valid addresses) and junk keys.
  const norm: Record<string, unknown> = Object.create(null);
  for (const [k, v] of entries) {
    const key = k.toLowerCase();
    if (LOWER_ADDR_RE.test(key)) norm[key] = v;
  }
  const count = Object.keys(norm).length;
  try {
    await prisma.campaignProofs.create({
      data: { root, claims: JSON.stringify(norm), count },
    });
  } catch {
    // Unique violation — proofs are immutable (tied to the root), so a second
    // publish for the same root is rejected rather than overwriting.
    return NextResponse.json({ error: "Proofs already published for this root" }, { status: 409 });
  }
  return NextResponse.json({ ok: true, count });
}

export async function GET(req: NextRequest) {
  const root = req.nextUrl.searchParams.get("root")?.toLowerCase();
  if (!root || !ROOT_RE.test(root)) {
    return NextResponse.json({ error: "root query required" }, { status: 400 });
  }
  const row = await prisma.campaignProofs.findUnique({ where: { root } });
  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });
  // The stored claims are JSON text we wrote ourselves — embed the string
  // directly instead of parse + re-stringify (up to MAX_CLAIMS entries on the
  // eligibility hot path).
  return new NextResponse(`{"claims":${row.claims}}`, {
    headers: { "content-type": "application/json" },
  });
}
