import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { verifyDropOperator } from "@/lib/server/dropVerify";
import { requireWallet } from "@/lib/server/session";
import {
  announcementDto,
  parseAnnouncementPatch,
  windowError,
} from "@/lib/server/announcementInput";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** Public single-announcement read (board detail page). */
export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const row = await prisma.announcement.findUnique({ where: { id } });
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ announcement: announcementDto(row) });
}

/**
 * Update an announcement — edit copy, link the created campaign (`drop`), or
 * cancel. Only the posting wallet may write; a signed-in stranger gets 403.
 */
export async function PATCH(req: NextRequest, { params }: Params) {
  const wallet = await requireWallet();
  if (!wallet) return NextResponse.json({ error: "Sign-in required" }, { status: 401 });
  const { id } = await params;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = parseAnnouncementPatch(body);
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const row = await prisma.announcement.findUnique({ where: { id } });
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (row.operator !== wallet) {
    return NextResponse.json({ error: "Only the announcement's operator can edit it" }, { status: 403 });
  }
  // Cross-field window check against the merged values (a lone expectedStart
  // patch must not leapfrog a stored expectedEnd).
  const windowErr = windowError(
    parsed.value.expectedStart ?? row.expectedStart,
    parsed.value.expectedEnd !== undefined ? parsed.value.expectedEnd : row.expectedEnd,
  );
  if (windowErr) return NextResponse.json({ error: windowErr }, { status: 400 });
  // Linking borrows the drop's LIVE badge + claim CTA, so prove on-chain that
  // the drop really belongs to this announcement's operator (and, implicitly,
  // to its chain — the lookup runs on the announcement's registered network).
  // A no-op relink (same stored value) is skipped: it already passed once, and
  // an idempotent retry must not fail on a transient RPC blip.
  if (typeof parsed.value.drop === "string" && parsed.value.drop !== row.drop) {
    // Optional creation-tx hash → O(1) receipt check inside the verifier
    // (normalization/validation happen there).
    const dropErr = await verifyDropOperator(
      row.chainId,
      parsed.value.drop,
      row.operator,
      body && typeof body === "object" ? (body as Record<string, unknown>).txHash : undefined,
    );
    if (dropErr) return NextResponse.json({ error: dropErr }, { status: 422 });
  }
  const updated = await prisma.announcement.update({ where: { id }, data: parsed.value });
  return NextResponse.json({ announcement: announcementDto(updated) });
}
