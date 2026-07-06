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
    // A signed message is only single-use if we issued a nonce and enforce it.
    // siwe.verify silently skips the nonce check when the expected value is
    // undefined, so a fresh (nonce-less) session would accept a captured
    // message+signature indefinitely (replay). Require the nonce to exist.
    if (!session.nonce) {
      return NextResponse.json(
        { error: "No sign-in challenge in progress — request a nonce first" },
        { status: 401 },
      );
    }
    const siwe = new SiweMessage(message);
    // Bind the signed message to this app's domain (the client signs
    // window.location.host) so a message signed on another site can't be
    // replayed here. SIWE_DOMAIN is the trusted anchor and is required in
    // production (like SESSION_SECRET); the Host-header fallback is dev-only
    // — an attacker POSTing directly controls their own headers, so the
    // header is not a trusted anchor. Empty domain fails verification.
    const configured = process.env.SIWE_DOMAIN;
    if (!configured && process.env.NODE_ENV === "production") {
      return NextResponse.json(
        { error: "SIWE_DOMAIN is not configured" },
        { status: 500 },
      );
    }
    const expectedDomain = configured || req.headers.get("host") || "";
    const { data } = await siwe.verify({
      signature,
      nonce: session.nonce,
      domain: expectedDomain,
    });
    const address = data.address.toLowerCase();
    // Any verified wallet gets a session — operator-facing writes (e.g.
    // announcements) need a signed-in author. Admin-only routes still gate on
    // requireAdmin(), so a non-admin session grants nothing extra there.
    session.address = address;
    session.nonce = undefined;
    await session.save();
    // Best-effort after the save: a transient admin-lookup failure must not
    // surface as "verification failed" when the session was already persisted.
    const isAdmin = await isPlatformAdmin(address).catch(() => false);
    return NextResponse.json({ address, isAdmin });
  } catch {
    return NextResponse.json({ error: "SIWE verification failed" }, { status: 401 });
  }
}
