import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requireWallet } from "@/lib/server/session";
import { parseQuestCreate } from "@/lib/server/questInput";
import { campaignDto } from "@/lib/server/questDto";
import { eligibleWallets } from "@/lib/server/questAggregate";
import { MAX_QUESTS_PER_OPERATOR, providersForTasks } from "@/lib/quests";
import { isChainId, LOWER_ADDR_RE } from "@/lib/server/apiInput";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Quest campaigns (docs/SOCIAL-TASK-DESIGN.md §6). Creation and listing are
 * operator-scoped: a campaign is a work-in-progress recipient-list builder,
 * not a public board — the public surface is GET /api/quests/[id] (the /q/[id]
 * page) which recipients reach via the operator's shared link, plus the
 * `?chainId&drop` lookup below (the on-chain campaign page's "does this drop
 * have a quest" check) — a narrow, id-only exception: it doesn't expose the
 * operator's campaign list, only whether one specific already-public drop is
 * linked to a quest, for the §9-3 /c/[id] → /q/[id] link.
 */

/**
 * Public: does this (chainId, drop) vault have a linked quest campaign? Used
 * by the on-chain campaign detail page to conditionally show a "quest tasks"
 * link — deliberately minimal fields (id/title/closesAt), not the full
 * campaignDto, since this branch is unauthenticated.
 */
async function getByDrop(chainId: number, drop: string) {
  const row = await prisma.questCampaign.findFirst({
    where: { chainId, drop },
    select: { id: true, title: true, closesAt: true },
    // No unique constraint on (chainId, drop) — `drop` is patchable, so more
    // than one campaign could in principle end up linked to the same vault.
    // Prefer the most recently created one for a deterministic result.
    orderBy: { createdAt: "desc" },
  });
  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({
    quest: { id: row.id, title: row.title, closesAt: row.closesAt.toISOString() },
  });
}

/**
 * The signed-in operator's campaigns, with a live eligible-wallet count per
 * campaign (the manage-page badge). Computed here in a fixed 3 queries total
 * — not per-campaign — so the list doesn't fan out into an N+1 of aggregation
 * round trips as the operator accumulates campaigns.
 */
export async function GET(req: NextRequest) {
  if (req.nextUrl.searchParams.has("chainId") || req.nextUrl.searchParams.has("drop")) {
    const chainIdParam = req.nextUrl.searchParams.get("chainId");
    const chainId = Number(chainIdParam);
    const dropParam = req.nextUrl.searchParams.get("drop")?.toLowerCase();
    if (chainIdParam === null || dropParam === undefined) {
      return NextResponse.json({ error: "chainId and drop query required" }, { status: 400 });
    }
    if (!isChainId(chainId) || !LOWER_ADDR_RE.test(dropParam)) {
      return NextResponse.json({ error: "invalid chainId or drop" }, { status: 400 });
    }
    return getByDrop(chainId, dropParam);
  }

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
