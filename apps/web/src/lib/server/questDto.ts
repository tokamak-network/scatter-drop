import type { Prisma } from "@prisma/client";

/**
 * JSON shape shared by every quest route (Next.js route files may only export
 * handlers, so the DTO mapper lives here).
 */
export function campaignDto(
  c: Prisma.QuestCampaignGetPayload<{ include: { tasks: true } }>,
) {
  return {
    id: c.id,
    chainId: c.chainId,
    operator: c.operator,
    title: c.title,
    closesAt: c.closesAt.toISOString(),
    amountMode: c.amountMode,
    totalAmount: c.totalAmount,
    drop: c.drop,
    createdAt: c.createdAt.toISOString(),
    tasks: c.tasks.map(taskDto),
  };
}

export function taskDto(t: Prisma.QuestTaskGetPayload<object>) {
  let config: Record<string, string> = {};
  try {
    config = JSON.parse(t.config) as Record<string, string>;
  } catch {
    /* corrupt row — degrade to an empty config rather than 500 the whole read */
  }
  return {
    id: t.id,
    kind: t.kind,
    config,
    required: t.required,
    tier: t.tier,
  };
}
