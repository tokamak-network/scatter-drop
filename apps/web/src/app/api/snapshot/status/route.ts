import { NextResponse, type NextRequest } from "next/server";
import { getJob, snapshotAuthError } from "@/lib/server/snapshot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (snapshotAuthError(req.headers.get("authorization"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const id = req.nextUrl.searchParams.get("jobId");
  if (!id) return NextResponse.json({ error: "jobId required" }, { status: 400 });

  const job = getJob(id);
  if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });

  return NextResponse.json({
    state: job.state,
    progress: job.progress,
    error: job.error,
  });
}
