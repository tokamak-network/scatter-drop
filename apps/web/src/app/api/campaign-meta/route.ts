import { NextResponse, type NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { isChainId, LOWER_ADDR_RE } from "@/lib/server/apiInput";
import { parseCampaignMeta } from "@/lib/server/campaignMetaInput";
import { verifyDropOperator } from "@/lib/server/dropVerify";
import { requireWallet } from "@/lib/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Operator-entered campaign name/description, keyed by (chainId, drop). The
 * wizard collects these but DropCreated doesn't carry them on-chain, so
 * without this store they were silently dropped and every campaign rendered
 * as "<SYMBOL> airdrop".
 *
 * Create-only, and writes are operator-authenticated: the poster's SIWE
 * wallet must be the drop's on-chain DropCreated operator (verifyDropOperator,
 * fail-closed) — otherwise a third party racing the wizard could squat a new
 * drop's public name/description. Reads stay public.
 */

// DoS bound on total rows — writes are authenticated now, but the store is
// still finite (like MAX_ROOTS in /api/proofs).
const MAX_METAS = 1_000;

export async function POST(req: NextRequest) {
  const wallet = await requireWallet();
  if (!wallet) return NextResponse.json({ error: "Sign-in required" }, { status: 401 });
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = parseCampaignMeta(body);
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const { chainId, drop, name, description, txHash } = parsed.value;
  // The name/description render as the drop's public identity, so only its
  // on-chain operator may set them. txHash (the creation tx, sent by the
  // wizard) is the O(1) receipt path; without it the verifier falls back to a
  // bounded DropCreated scan. Verified BEFORE the DB transaction so the RPC
  // round-trip doesn't hold locks.
  const dropErr = await verifyDropOperator(chainId, drop, wallet, txHash);
  if (dropErr) return NextResponse.json({ error: dropErr }, { status: 422 });
  try {
    // Cap check + insert in one Serializable transaction — concurrent POSTs
    // near the cap could otherwise all pass the count and overshoot (TOCTOU),
    // like the announcements caps.
    const result = await prisma.$transaction(
      async (tx) => {
        if ((await tx.campaignMeta.count()) >= MAX_METAS) {
          return { status: 507, error: "Metadata store is full" } as const;
        }
        await tx.campaignMeta.create({
          data: { chainId, drop, name, description: description || null },
        });
        return { status: 200 } as const;
      },
      { isolationLevel: "Serializable" },
    );
    if (result.status !== 200) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
  } catch (err) {
    // Unique violation → the campaign already has metadata; first write wins.
    // Anything else is a real DB failure, not a conflict.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return NextResponse.json({ error: "Metadata already set for this drop" }, { status: 409 });
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

/**
 * Edit (or backfill) a campaign's name/description. Same validation and
 * on-chain operator proof as POST, but upserts: the verified operator may
 * change their campaign's copy after creation, and may set it for campaigns
 * created before the metadata store existed. POST stays create-only for the
 * wizard's fire-and-forget publish.
 */
export async function PATCH(req: NextRequest) {
  const wallet = await requireWallet();
  if (!wallet) return NextResponse.json({ error: "Sign-in required" }, { status: 401 });
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = parseCampaignMeta(body);
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const { chainId, drop, name, description, txHash } = parsed.value;
  const dropErr = await verifyDropOperator(chainId, drop, wallet, txHash);
  if (dropErr) return NextResponse.json({ error: dropErr }, { status: 422 });
  // Upsert-with-cap in one transaction (like the announcements caps): the
  // create leg must not push total rows past MAX_METAS.
  const result = await prisma.$transaction(
    async (tx) => {
      const existing = await tx.campaignMeta.findUnique({
        where: { chainId_drop: { chainId, drop } },
      });
      if (!existing && (await tx.campaignMeta.count()) >= MAX_METAS) {
        return { status: 507, error: "Metadata store is full" } as const;
      }
      await tx.campaignMeta.upsert({
        where: { chainId_drop: { chainId, drop } },
        update: { name, description: description || null },
        create: { chainId, drop, name, description: description || null },
      });
      return { status: 200 } as const;
    },
    { isolationLevel: "Serializable" },
  );
  if (result.status !== 200) {
    return NextResponse.json({ error: result.error }, { status: result.status });
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
