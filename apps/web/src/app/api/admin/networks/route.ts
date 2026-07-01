import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/server/session";
import { parseNetwork } from "@/lib/server/networkInput";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Admin: full list (incl. disabled + rpcUrl). */
export async function GET() {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Admin only" }, { status: 401 });
  const networks = await prisma.network.findMany({ orderBy: { name: "asc" } });
  return NextResponse.json({ networks });
}

/** Admin: add a network. */
export async function POST(req: NextRequest) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Admin only" }, { status: 401 });
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = parseNetwork(body);
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const exists = await prisma.network.findUnique({ where: { chainId: parsed.chainId } });
  if (exists) return NextResponse.json({ error: "chainId already registered" }, { status: 409 });
  const network = await prisma.network.create({ data: parsed });
  return NextResponse.json({ network });
}
