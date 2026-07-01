import { NextResponse } from "next/server";
import { getPublicNetworks } from "@/lib/server/networks";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Public: enabled networks, sanitized (server rpcUrl never exposed). */
export async function GET() {
  return NextResponse.json({ networks: await getPublicNetworks() });
}
