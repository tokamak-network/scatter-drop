import { NextResponse, type NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * In-memory proofs store keyed by the campaign's `merkleRoot`. This is the
 * off-chain proofs.json seam (DESIGN §8.7/§12) made real without infra: a
 * campaign publishes its per-recipient `claims` here and the claim page reads
 * them back to find a wallet's proof.
 *
 * NOTE: ephemeral (per server instance) — a stand-in for IPFS pinning
 * (Filebase/Pinata) + an on-chain proofsCid. Swap the backend later; the
 * client contract (root → claims) stays the same.
 */
const store = new Map<string, Record<string, unknown>>();

const ROOT_RE = /^0x[0-9a-f]{64}$/;
const ADDR_RE = /^0x[0-9a-f]{40}$/;
// Bound memory: this is an untrusted, unauthenticated dev store (a stand-in for
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
  // Proofs are immutable (tied to the root) — don't let anyone overwrite them.
  if (store.has(root)) {
    return NextResponse.json({ error: "Proofs already published for this root" }, { status: 409 });
  }
  if (store.size >= MAX_ROOTS) {
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
    if (ADDR_RE.test(key)) norm[key] = v;
  }
  store.set(root, norm);
  return NextResponse.json({ ok: true, count: Object.keys(norm).length });
}

export async function GET(req: NextRequest) {
  const root = req.nextUrl.searchParams.get("root")?.toLowerCase();
  if (!root || !ROOT_RE.test(root)) {
    return NextResponse.json({ error: "root query required" }, { status: 400 });
  }
  const claims = store.get(root);
  if (!claims) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ claims });
}
