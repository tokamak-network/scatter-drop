import { NextResponse, type NextRequest } from "next/server";
import { getJob } from "@/lib/server/snapshot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
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
