import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requireWallet } from "@/lib/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The signed-in wallet's per-campaign progress for the /q/[id] page: which
 * tasks it completed and which social providers it has actively bound.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const wallet = await requireWallet();
  if (!wallet) return NextResponse.json({ error: "Sign-in required" }, { status: 401 });
  const { id } = await params;
  const [completions, bindings] = await Promise.all([
    prisma.questCompletion.findMany({
      where: { campaignId: id, wallet },
      select: { taskId: true },
    }),
    prisma.walletSocial.findMany({
      where: { wallet, unboundAt: null },
      select: { provider: true },
    }),
  ]);
  return NextResponse.json({
    completions: completions.map((c) => c.taskId),
    bindings: bindings.map((b) => ({ provider: b.provider })),
  });
}
