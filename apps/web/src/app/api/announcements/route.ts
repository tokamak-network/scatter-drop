import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requireWallet } from "@/lib/server/session";
import { isChainId, LOWER_ADDR_RE } from "@/lib/server/apiInput";
import {
  MAX_ANNOUNCEMENTS,
  MAX_OPEN_PER_OPERATOR,
  MAX_TOTAL_PER_OPERATOR,
} from "@/lib/announcementLimits";
import { announcementDto, parseAnnouncement } from "@/lib/server/announcementInput";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * "Upcoming Drops" announcements. Unlike the create-only anonymous stores
 * (/api/proofs, /api/campaign-meta), this is a public board: posts are
 * SIWE-authenticated (see /api/auth) so an announcement's `operator` is a
 * verified wallet, not a race winner — otherwise the board is an open
 * spam/impersonation channel. Reads are public.
 */

/** Public list for a chain: `?chainId=…` required, `&operator=0x…` optional. */
export async function GET(req: NextRequest) {
  const chainId = Number(req.nextUrl.searchParams.get("chainId"));
  if (!isChainId(chainId)) {
    return NextResponse.json({ error: "chainId query required" }, { status: 400 });
  }
  const operator = req.nextUrl.searchParams.get("operator")?.toLowerCase();
  if (operator && !LOWER_ADDR_RE.test(operator)) {
    return NextResponse.json({ error: "Invalid operator address" }, { status: 400 });
  }
  const rows = await prisma.announcement.findMany({
    where: { chainId, ...(operator ? { operator } : {}) },
    orderBy: { expectedStart: "asc" },
  });
  return NextResponse.json({ announcements: rows.map(announcementDto) });
}

/** Create an announcement as the signed-in wallet. */
export async function POST(req: NextRequest) {
  const operator = await requireWallet();
  if (!operator) {
    return NextResponse.json({ error: "Sign-in required" }, { status: 401 });
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = parseAnnouncement(body);
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
  // Both caps re-checked and the row inserted in one transaction, so
  // concurrent POSTs can't all pass the counts and overshoot (TOCTOU).
  const result = await prisma.$transaction(async (tx) => {
    // Open (non-canceled) rows only: counting canceled history would let the
    // ever-growing tombstones permanently brick the board once 1000 total
    // announcements have ever existed.
    if (
      (await tx.announcement.count({ where: { canceled: false } })) >= MAX_ANNOUNCEMENTS
    ) {
      return { status: 507, error: "Announcement store is full" } as const;
    }
    // Two per-wallet caps: open rows (board occupancy — canceling frees the
    // slot) and total rows including canceled (storage — the open cap alone
    // doesn't stop a create→cancel loop from growing tombstones forever).
    const [open, total] = await Promise.all([
      tx.announcement.count({ where: { operator, canceled: false } }),
      tx.announcement.count({ where: { operator } }),
    ]);
    if (total >= MAX_TOTAL_PER_OPERATOR) {
      return {
        status: 429,
        error: `This wallet has reached its lifetime limit of ${MAX_TOTAL_PER_OPERATOR} announcements`,
      } as const;
    }
    if (open >= MAX_OPEN_PER_OPERATOR) {
      return {
        status: 429,
        error: `You already have ${MAX_OPEN_PER_OPERATOR} open announcements — cancel one to post another`,
      } as const;
    }
    const row = await tx.announcement.create({ data: { ...parsed.value, operator } });
    return { status: 200, row } as const;
  });
  if (result.status !== 200) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({ announcement: announcementDto(result.row) });
}
