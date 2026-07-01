import { NextResponse } from "next/server";
import { generateNonce } from "siwe";
import { getSession } from "@/lib/server/session";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  session.nonce = generateNonce();
  await session.save();
  return new NextResponse(session.nonce, { headers: { "Content-Type": "text/plain" } });
}
