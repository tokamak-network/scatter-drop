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
  if (typeof b.claims !== "object" || b.claims === null) {
    return NextResponse.json({ error: "Invalid claims" }, { status: 400 });
  }
  // Normalize address keys to lowercase so lookups are case-insensitive.
  const norm: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(b.claims as Record<string, unknown>)) {
    norm[k.toLowerCase()] = v;
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
