import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requireWallet } from "@/lib/server/session";
import { parseQuestCreate } from "@/lib/server/questInput";
import { campaignDto } from "@/lib/server/questDto";
import { eligibleWallets } from "@/lib/server/questAggregate";
import { MAX_QUESTS_PER_OPERATOR, providersForTasks } from "@/lib/quests";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Quest campaigns (docs/SOCIAL-TASK-DESIGN.md §6). Creation and listing are
 * operator-scoped: a campaign is a work-in-progress recipient-list builder,
 * not a public board — the public surface is GET /api/quests/[id] (the /q/[id]
 * page) which recipients reach via the operator's shared link.
 */

/**
 * The signed-in operator's campaigns, with a live eligible-wallet count per
 * campaign (the manage-page badge). Computed here in a fixed 3 queries total
 * — not per-campaign — so the list doesn't fan out into an N+1 of aggregation
 * round trips as the operator accumulates campaigns.
 */
export async function GET() {
  const operator = await requireWallet();
  if (!operator) {
    return NextResponse.json({ error: "Sign-in required" }, { status: 401 });
  }
  const rows = await prisma.questCampaign.findMany({
    where: { operator },
    include: { tasks: true, completions: { select: { wallet: true, taskId: true } } },
    orderBy: { createdAt: "desc" },
  });

  const providers = providersForTasks(rows.flatMap((r) => r.tasks));
  const wallets = [...new Set(rows.flatMap((r) => r.completions.map((c) => c.wallet)))];
  const bindings =
    providers.length && wallets.length
      ? await prisma.walletSocial.findMany({
          where: { provider: { in: providers }, unboundAt: null, wallet: { in: wallets } },
          select: { provider: true, wallet: true },
        })
      : [];

  return NextResponse.json({
    campaigns: rows.map((r) => ({
      ...campaignDto(r),
      eligibleCount: eligibleWallets(r.tasks, r.completions, bindings).length,
    })),
  });
}

/** Create a campaign (+ its tasks) as the signed-in wallet. */
export async function POST(req: NextRequest) {
  const operator = await requireWallet();
  if (!operator) {
    return NextResponse.json({ error: "Sign-in required" }, { status: 401 });
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = parseQuestCreate(body);
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });

  // Cap re-checked and the row inserted in one Serializable transaction so
  // concurrent POSTs can't overshoot the per-operator storage cap (TOCTOU —
  // same pattern as /api/announcements).
  const result = await prisma.$transaction(
    async (tx) => {
      const count = await tx.questCampaign.count({ where: { operator } });
      if (count >= MAX_QUESTS_PER_OPERATOR) {
        return {
          status: 429,
          error: `This wallet has reached its limit of ${MAX_QUESTS_PER_OPERATOR} quest campaigns`,
        } as const;
      }
      const { tasks, ...campaign } = parsed.value;
      const row = await tx.questCampaign.create({
        data: { ...campaign, operator, tasks: { create: tasks } },
        include: { tasks: true },
      });
      return { status: 200, row } as const;
    },
    { isolationLevel: "Serializable" },
  );
  if (result.status !== 200) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({ campaign: campaignDto(result.row) });
}
