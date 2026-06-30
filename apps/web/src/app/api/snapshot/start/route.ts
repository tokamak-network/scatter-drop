import { NextResponse, type NextRequest } from "next/server";
import {
  getServerRpcUrl,
  parseSnapshotRequest,
  rateLimited,
  snapshotAuthError,
  startSnapshotJob,
} from "@/lib/server/snapshot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (snapshotAuthError(req.headers.get("authorization"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!getServerRpcUrl()) {
    return NextResponse.json(
      { error: "Snapshot service not configured on the server." },
      { status: 503 },
    );
  }

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (rateLimited(ip)) {
    return NextResponse.json(
      { error: "Rate limited — try again shortly." },
      { status: 429 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = parseSnapshotRequest(body);
  if ("error" in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const started = startSnapshotJob(parsed.params, parsed.mode);
  if ("error" in started) {
    return NextResponse.json({ error: started.error }, { status: 503 });
  }
  return NextResponse.json({ jobId: started.jobId });
}
