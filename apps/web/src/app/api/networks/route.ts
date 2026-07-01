import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Public: enabled networks, sanitized (never expose the server rpcUrl). */
export async function GET() {
  const nets = await prisma.network.findMany({
    where: { enabled: true },
    orderBy: { name: "asc" },
  });
  const networks = nets.map(({ rpcUrl: _rpc, ...safe }) => safe);
  return NextResponse.json({ networks });
}
