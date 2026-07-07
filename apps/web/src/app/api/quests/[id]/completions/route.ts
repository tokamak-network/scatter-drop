import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requireWallet } from "@/lib/server/session";
import { eligibleWallets, equalSplit } from "@/lib/server/questAggregate";
import { providersForTasks } from "@/lib/quests";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Operator aggregation (docs/SOCIAL-TASK-DESIGN.md §4⑤): wallets that
 * completed every required task → equal-split amounts, ready for
 * RecipientBuilder → buildDrop → createDrop(type=SOCIAL). Social-verified
 * completions only count while their binding is STILL active for the same
 * wallet (§7② — the aggregation-time rebinding guard).
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const wallet = await requireWallet();
  if (!wallet) return NextResponse.json({ error: "Sign-in required" }, { status: 401 });

  const { id } = await params;
  const campaign = await prisma.questCampaign.findUnique({
    where: { id },
    include: { tasks: true, completions: { select: { wallet: true, taskId: true } } },
  });
  if (!campaign) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (campaign.operator !== wallet) {
    return NextResponse.json({ error: "Not your campaign" }, { status: 403 });
  }

  // Only providers any task actually uses, only ACTIVE bindings, and only
  // wallets that actually appear in this campaign's completions — the
  // eligibility check never consults any other wallet's binding.
  const providers = providersForTasks(campaign.tasks);
  const completionWallets = [...new Set(campaign.completions.map((c) => c.wallet))];
  const bindings =
    providers.length && completionWallets.length
      ? await prisma.walletSocial.findMany({
          where: { provider: { in: providers }, unboundAt: null, wallet: { in: completionWallets } },
          select: { provider: true, wallet: true },
        })
      : [];

  const wallets = eligibleWallets(campaign.tasks, campaign.completions, bindings);
  return NextResponse.json({
    wallets,
    count: wallets.length,
    amountPerWallet: equalSplit(campaign.totalAmount, wallets.length),
  });
}
