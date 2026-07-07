import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requireWallet } from "@/lib/server/session";
import { rateLimited } from "@/lib/server/apiAuth";
import { verifierForKind } from "@/lib/server/questVerifiers";
import { providerForKind } from "@/lib/quests";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Server-side task verification (docs/SOCIAL-TASK-DESIGN.md §4③): the signed
 * -in wallet asks "check this task for me". The verdict comes ONLY from the
 * server's own API call (via the kind's verifier adapter) — nothing the client
 * claims is trusted. Success upserts QuestCompletion (idempotent re-checks).
 *
 * Verifiers only ever see the wallet's ACTIVE binding (§7①): a wallet whose
 * account moved away can't keep accruing completions on the old binding.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; taskId: string }> },
) {
  const wallet = await requireWallet();
  if (!wallet) return NextResponse.json({ error: "Sign-in required" }, { status: 401 });

  // Per-wallet limiter: verification fans out to third-party APIs (Discord),
  // so one wallet hammering "check" must not burn the shared bot's budget.
  if (rateLimited(`quest-verify:${wallet}`, 10, 60_000)) {
    return NextResponse.json({ error: "Too many checks — wait a minute" }, { status: 429 });
  }

  const { id, taskId } = await params;
  const task = await prisma.questTask.findUnique({
    where: { id: taskId },
    include: { campaign: true },
  });
  if (!task || task.campaignId !== id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (task.campaign.closesAt.getTime() <= Date.now()) {
    return NextResponse.json(
      { verified: false, reason: "This quest campaign has closed." },
      { status: 410 },
    );
  }

  const verifier = verifierForKind(task.kind);
  if (!verifier) {
    return NextResponse.json({ error: "Unsupported task kind" }, { status: 500 });
  }

  const provider = providerForKind(task.kind);
  const binding = provider
    ? await prisma.walletSocial.findFirst({
        where: { provider, wallet, unboundAt: null },
      })
    : null;

  const outcome = await verifier(task, wallet, binding);
  if (!outcome.ok) {
    return NextResponse.json(
      { verified: false, reason: outcome.reason },
      { status: outcome.status ?? 200 },
    );
  }

  await prisma.questCompletion.upsert({
    where: { campaignId_wallet_taskId: { campaignId: id, wallet, taskId } },
    create: { campaignId: id, wallet, taskId, evidence: outcome.evidence },
    update: { verifiedAt: new Date(), evidence: outcome.evidence },
  });
  return NextResponse.json({ verified: true });
}
