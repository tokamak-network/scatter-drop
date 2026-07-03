import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { isChainId, LOWER_ADDR_RE } from "@/lib/server/apiInput";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Operator-entered campaign name/description, keyed by (chainId, drop). The
 * wizard collects these but DropCreated doesn't carry them on-chain, so
 * without this store they were silently dropped and every campaign rendered
 * as "<SYMBOL> airdrop".
 *
 * Create-only and unauthenticated, mirroring /api/proofs: the first write for
 * a drop wins (posted by the wizard right after createDrop confirms). Note
 * the trust model this buys is only "no overwrites" — a third party who wins
 * the race can still squat a new drop's name. The deeper fix (verify the
 * poster against the on-chain DropCreated operator, e.g. via a SIWE-style
 * signature) is deferred while this remains a dev-stage store.
 */

const MAX_NAME = 80;
const MAX_DESCRIPTION = 400;
// DoS bound for the unauthenticated store, like MAX_ROOTS in /api/proofs.
const MAX_METAS = 1_000;

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const b = body as {
    chainId?: unknown;
    drop?: unknown;
    name?: unknown;
    description?: unknown;
  };
  const chainId = isChainId(b.chainId) ? b.chainId : null;
  const drop = typeof b.drop === "string" ? b.drop.toLowerCase() : null;
  const name = typeof b.name === "string" ? b.name.trim() : "";
  const description = typeof b.description === "string" ? b.description.trim() : "";
  if (!chainId) return NextResponse.json({ error: "Invalid chainId" }, { status: 400 });
  if (!drop || !LOWER_ADDR_RE.test(drop)) {
    return NextResponse.json({ error: "Invalid drop address" }, { status: 400 });
  }
  if (!name || name.length > MAX_NAME) {
    return NextResponse.json({ error: `name required (max ${MAX_NAME} chars)` }, { status: 400 });
  }
  if (description.length > MAX_DESCRIPTION) {
    return NextResponse.json({ error: `description too long (max ${MAX_DESCRIPTION} chars)` }, { status: 400 });
  }
  if ((await prisma.campaignMeta.count()) >= MAX_METAS) {
    return NextResponse.json({ error: "Metadata store is full" }, { status: 507 });
  }
  try {
    await prisma.campaignMeta.create({
      data: { chainId, drop, name, description: description || null },
    });
  } catch {
    // Unique violation → the campaign already has metadata; first write wins.
    return NextResponse.json({ error: "Metadata already set for this drop" }, { status: 409 });
  }
  return NextResponse.json({ ok: true });
}

/**
 * A chain's campaign metadata as { [drop]: {name, description} }. Pass
 * `&drop=0x…` to fetch a single campaign's entry (same response shape).
 */
export async function GET(req: NextRequest) {
  const chainId = Number(req.nextUrl.searchParams.get("chainId"));
  if (!isChainId(chainId)) {
    return NextResponse.json({ error: "chainId query required" }, { status: 400 });
  }
  const drop = req.nextUrl.searchParams.get("drop")?.toLowerCase();
  if (drop && !LOWER_ADDR_RE.test(drop)) {
    return NextResponse.json({ error: "Invalid drop address" }, { status: 400 });
  }
  const rows = await prisma.campaignMeta.findMany({
    where: drop ? { chainId, drop } : { chainId },
  });
  const metas: Record<string, { name: string; description: string | null }> = {};
  for (const r of rows) metas[r.drop] = { name: r.name, description: r.description };
  return NextResponse.json({ metas });
}
