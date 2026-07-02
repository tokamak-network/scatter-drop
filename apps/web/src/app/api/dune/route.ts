import { NextResponse, type NextRequest } from "next/server";
import { apiAuthError, rateLimited } from "@/lib/server/apiAuth";
import { fetchDuneRows, parseDuneUrl } from "@/lib/server/dune";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST { url } — fetch an operator's Dune query results (BYO api_key in the URL),
 * paginate, and return a normalized `{ address, amount }` list for the recipient
 * builder. The URL host is locked to api.dune.com (SSRF guard in parseDuneUrl).
 */
export async function POST(req: NextRequest) {
  if (apiAuthError(req.headers.get("authorization"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (rateLimited(ip)) {
    return NextResponse.json({ error: "Rate limited — try again shortly." }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const url = parseDuneUrl((body as { url?: unknown } | null)?.url);
  if ("error" in url) {
    return NextResponse.json({ error: url.error }, { status: 400 });
  }

  try {
    const { rows, total, truncated } = await fetchDuneRows(url);
    return NextResponse.json({ rows, total, truncated });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Dune import failed.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
