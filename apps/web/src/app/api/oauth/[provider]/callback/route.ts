import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/server/session";
import { oauthProviderFor } from "@/lib/server/oauth";
import { bindError, walletAlreadyBoundError } from "@/lib/server/socialBindings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * OAuth callback → WalletSocial binding (docs/SOCIAL-TASK-DESIGN.md §4②/§7).
 * Provider-agnostic — see lib/server/oauth for the adapter registry. Errors
 * land back on the page the flow started from as ?social_error=… so the
 * recipient page can render them; success returns with ?social=linked.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ provider: string }> },
) {
  const { provider } = await params;
  const adapter = oauthProviderFor(provider);
  // Truly unknown provider (bad route param) — nothing to redirect back to.
  if (!adapter) {
    return NextResponse.json({ error: "Unsupported provider" }, { status: 404 });
  }

  const session = await getSession();
  const wallet = session.address;
  const expectedState = session.oauthState;
  const returnTo = session.oauthReturnTo ?? "/";
  // One-shot state: consumed whether the flow succeeds or not.
  session.oauthState = undefined;
  session.oauthReturnTo = undefined;
  await session.save();

  const back = (query: string) =>
    NextResponse.redirect(new URL(`${returnTo}${returnTo.includes("?") ? "&" : "?"}${query}`, req.nextUrl.origin));
  const fail = (message: string) =>
    back(`social_error=${encodeURIComponent(message)}`);

  // Configured is a runtime/deployment state (env vars), not a route problem —
  // send the user back to the quest page with a readable reason instead of a
  // bare 404, consistent with every other failure in this callback.
  if (!adapter.configured()) {
    return fail(`${provider} account linking is not configured on this server.`);
  }
  if (!wallet) return fail("Sign in with your wallet first.");
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  if (!code || !state || !expectedState || state !== expectedState) {
    return fail(`${provider} sign-in was cancelled or expired — try again.`);
  }

  const redirectUri = `${req.nextUrl.origin}/api/oauth/${provider}/callback`;
  const user = await adapter.fetchUser(code, redirectUri);
  if ("error" in user) return fail(user.error);

  // Binding rules (§7): 1 account = 1 wallet (soft-unbind cooldown) and one
  // active account per wallet+provider. Checked and written atomically so two
  // concurrent callbacks can't both pass the read.
  const error = await prisma.$transaction(
    async (tx) => {
      const existing = await tx.walletSocial.findUnique({
        where: { provider_providerAccountId: { provider, providerAccountId: user.id } },
      });
      const accountErr = bindError(existing, wallet);
      if (accountErr) return accountErr;

      const activeForWallet = await tx.walletSocial.findFirst({
        where: { provider, wallet, unboundAt: null },
      });
      const walletErr = walletAlreadyBoundError(
        activeForWallet?.providerAccountId ?? null,
        user.id,
      );
      if (walletErr) return walletErr;

      await tx.walletSocial.upsert({
        where: { provider_providerAccountId: { provider, providerAccountId: user.id } },
        create: { provider, providerAccountId: user.id, wallet, quality: user.quality },
        // Rebind after cooldown (or idempotent re-link): fresh boundAt,
        // binding re-activated. History stays via the same row's audit trail.
        update: { wallet, boundAt: new Date(), unboundAt: null, quality: user.quality },
      });
      return null;
    },
    { isolationLevel: "Serializable" },
  );

  return error ? fail(error) : back("social=linked");
}
