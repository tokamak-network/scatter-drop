import { NextResponse } from "next/server";
import { getSession, isPlatformAdmin } from "@/lib/server/session";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  const isAdmin = await isPlatformAdmin(session.address);
  return NextResponse.json({ address: session.address ?? null, isAdmin });
}
