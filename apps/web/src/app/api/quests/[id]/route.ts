import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requireWallet } from "@/lib/server/session";
import { parseQuestPatch } from "@/lib/server/questInput";
import { campaignDto } from "@/lib/server/questDto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * Public campaign read — the /q/[id] recipient page renders from this, so it
 * exposes exactly what a recipient needs (title, window, tasks + tier badges).
 */
export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const row = await prisma.questCampaign.findUnique({
    where: { id },
    include: { tasks: true },
  });
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ campaign: campaignDto(row) });
}

/** Operator-only field updates (task edits are out of v1 scope). */
export async function PATCH(req: NextRequest, { params }: Params) {
  const wallet = await requireWallet();
  if (!wallet) return NextResponse.json({ error: "Sign-in required" }, { status: 401 });
  const { id } = await params;
  const row = await prisma.questCampaign.findUnique({ where: { id } });
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (row.operator !== wallet) {
    return NextResponse.json({ error: "Not your campaign" }, { status: 403 });
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = parseQuestPatch(body);
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const updated = await prisma.questCampaign.update({
    where: { id },
    data: parsed.value,
    include: { tasks: true },
  });
  return NextResponse.json({ campaign: campaignDto(updated) });
}
