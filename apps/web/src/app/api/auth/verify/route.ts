import { NextResponse, type NextRequest } from "next/server";
import { SiweMessage } from "siwe";
import { getSession, isPlatformAdmin } from "@/lib/server/session";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const session = await getSession();
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const { message, signature } = (body ?? {}) as { message?: unknown; signature?: unknown };
  if (typeof message !== "string" || typeof signature !== "string") {
    return NextResponse.json({ error: "message and signature required" }, { status: 400 });
  }
  try {
    const siwe = new SiweMessage(message);
    const { data } = await siwe.verify({ signature, nonce: session.nonce });
    const address = data.address.toLowerCase();
    if (!(await isPlatformAdmin(address))) {
      return NextResponse.json({ address, isAdmin: false, error: "Not a platform admin" }, { status: 403 });
    }
    session.address = address;
    session.nonce = undefined;
    await session.save();
    return NextResponse.json({ address, isAdmin: true });
  } catch {
    return NextResponse.json({ error: "SIWE verification failed" }, { status: 401 });
  }
}
