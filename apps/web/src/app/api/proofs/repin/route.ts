import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { isChainId, LOWER_ADDR_RE, ROOT_RE } from "@/lib/server/apiInput";
import { verifyDropOperator } from "@/lib/server/dropVerify";
import { pinJson } from "@/lib/server/pinning";
import { requireWallet } from "@/lib/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Re-pin an existing campaign's stored proofs to IPFS — the follow-up surface
 * for campaigns created before pinning was configured (or whose original pin
 * failed). Operator-authenticated: SIWE session + on-chain DropCreated
 * ownership proof, like campaign-meta. Returns the CID for the on-chain
 * publishProofs anchor tx.
 */
export async function POST(req: NextRequest) {
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
  if (typeof body !== "object" || body === null) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const b = body as { chainId?: unknown; drop?: unknown; root?: unknown; txHash?: unknown };
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

  // expectedRoot binds the re-pin to the drop's own merkle root — without it,
  // an operator of ANY campaign could mutate any root's stored cid.
  const rejection = await verifyDropOperator(chainId, drop, wallet, b.txHash, root);
  if (rejection) return NextResponse.json({ error: rejection }, { status: 422 });

  const row = await prisma.campaignProofs.findUnique({ where: { root } });
  if (!row) {
    return NextResponse.json(
      { error: "No stored proofs for this root — publish them first" },
      { status: 404 },
    );
  }

  let claims: unknown;
  try {
    claims = JSON.parse(row.claims);
  } catch {
    return NextResponse.json({ error: "Stored proofs are corrupt" }, { status: 500 });
  }
  try {
    const cid = await pinJson(`proofs-${root}.json`, { root, claims });
    if (!cid) {
      return NextResponse.json(
        { error: "IPFS pinning is not configured on this server" },
        { status: 503 },
      );
    }
    if (cid !== row.cid) {
      await prisma.campaignProofs.update({ where: { root }, data: { cid } });
    }
    return NextResponse.json({ ok: true, cid });
  } catch {
    return NextResponse.json({ error: "Pinning failed — please retry" }, { status: 502 });
  }
}
