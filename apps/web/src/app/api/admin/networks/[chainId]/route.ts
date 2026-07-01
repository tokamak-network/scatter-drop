import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ chainId: string }> };

async function resolveChainId(ctx: Ctx): Promise<number | null> {
  const { chainId } = await ctx.params;
  const n = Number(chainId);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/** Admin: patch (partial) — commonly enable/disable. */
export async function PATCH(req: NextRequest, ctx: Ctx) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Admin only" }, { status: 401 });
  const chainId = await resolveChainId(ctx);
  if (chainId === null) return NextResponse.json({ error: "Invalid chainId" }, { status: 400 });
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const data: Record<string, unknown> = {};
  if (typeof body.enabled === "boolean") data.enabled = body.enabled;
  if (typeof body.name === "string" && body.name.trim()) data.name = body.name.trim();
  if (typeof body.rpcUrl === "string" && /^https?:\/\//.test(body.rpcUrl)) data.rpcUrl = body.rpcUrl;
  if (typeof body.publicRpcUrl === "string") data.publicRpcUrl = body.publicRpcUrl || null;
  if (typeof body.explorerUrl === "string") data.explorerUrl = body.explorerUrl || null;
  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "No editable fields" }, { status: 400 });
  }
  try {
    const network = await prisma.network.update({ where: { chainId }, data });
    return NextResponse.json({ network });
  } catch {
    return NextResponse.json({ error: "Network not found" }, { status: 404 });
  }
}

/** Admin: delete a network. */
export async function DELETE(_req: NextRequest, ctx: Ctx) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Admin only" }, { status: 401 });
  const chainId = await resolveChainId(ctx);
  if (chainId === null) return NextResponse.json({ error: "Invalid chainId" }, { status: 400 });
  try {
    await prisma.network.delete({ where: { chainId } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Network not found" }, { status: 404 });
  }
}
