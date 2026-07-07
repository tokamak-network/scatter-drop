import { NextResponse, type NextRequest } from "next/server";
import { randomBytes } from "node:crypto";
import { getSession } from "@/lib/server/session";
import { oauthProviderFor } from "@/lib/server/oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Social OAuth kickoff (docs/SOCIAL-TASK-DESIGN.md §4②): a SIWE-signed-in
 * wallet starts the provider flow to bind its social account. The CSRF state
 * lives in the iron-session cookie so only this browser's callback can finish
 * the flow. Provider-agnostic — see lib/server/oauth for the adapter registry.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ provider: string }> },
) {
  const { provider } = await params;
  const adapter = oauthProviderFor(provider);
  if (!adapter) return NextResponse.json({ error: "Unsupported provider" }, { status: 404 });
  if (!adapter.configured()) {
    return NextResponse.json(
      { error: `${provider} account linking is not configured on this server` },
      { status: 503 },
    );
  }
  const session = await getSession();
  if (!session.address) {
    return NextResponse.json({ error: "Sign-in required" }, { status: 401 });
  }

  // Only same-app paths — an absolute returnTo would make this an open
  // redirect via the callback.
  const rawReturnTo = req.nextUrl.searchParams.get("returnTo") ?? "/";
  const returnTo = rawReturnTo.startsWith("/") && !rawReturnTo.startsWith("//")
    ? rawReturnTo
    : "/";

  const state = randomBytes(16).toString("hex");
  session.oauthState = state;
  session.oauthReturnTo = returnTo;
  await session.save();

  const redirectUri = `${req.nextUrl.origin}/api/oauth/${provider}/callback`;
  return NextResponse.redirect(adapter.authUrl(redirectUri, state));
}
