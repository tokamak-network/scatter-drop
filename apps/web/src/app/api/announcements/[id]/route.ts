import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { MAX_ANNOUNCEMENTS, MAX_OPEN_PER_OPERATOR } from "@/lib/announcementLimits";
import { canonicalDropToken, verifyDropOperatorDetailed } from "@/lib/server/dropVerify";
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
    const verdict = await verifyDropOperatorDetailed(
      row.chainId,
      parsed.value.drop,
      row.operator,
      body && typeof body === "object" ? (body as Record<string, unknown>).txHash : undefined,
    );
    if ("error" in verdict) {
      return NextResponse.json({ error: verdict.error }, { status: 422 });
    }
    // F3: the announced token must be what the linked drop actually
    // distributes — otherwise a scam drop could keep a reputable token's
    // address on its explorer-linked chip. The on-chain airdropToken is
    // canonical: a patch that explicitly contradicts it is rejected; a stale
    // stored value, an operator typo, or an omitted field is silently
    // corrected (native-ETH drops carry no ERC-20, so they clear the field).
    const canonical = canonicalDropToken(verdict.created);
    if (parsed.value.tokenAddress != null && parsed.value.tokenAddress !== canonical) {
      return NextResponse.json(
        { error: "tokenAddress does not match the linked drop's on-chain token" },
        { status: 400 },
      );
    }
    parsed.value.tokenAddress = canonical;
  } else if (
    row.drop &&
    parsed.value.drop !== null &&
    parsed.value.tokenAddress !== undefined &&
    parsed.value.tokenAddress !== row.tokenAddress
  ) {
    // Once a drop is linked, its token is fixed: a later patch that touches
    // ONLY tokenAddress (drop unchanged / omitted, not being unlinked) must
    // not repoint the chip to another token. row.tokenAddress is already the
    // canonical value the link-time check stored, so re-deriving it on-chain
    // would just burn an RPC round-trip for the same answer.
    return NextResponse.json(
      { error: "tokenAddress is fixed to the linked drop's on-chain token" },
      { status: 400 },
    );
  }
  // Reopening (canceled → open) takes a board slot back, so it must pass the
  // same caps as POST — otherwise cancel + repost + reopen multiplies an
  // operator's open rows past every limit. Checked atomically on the row's
  // state inside the transaction (the pre-read above may be stale).
  const result = await prisma.$transaction(
    async (tx) => {
      if (parsed.value.canceled === false) {
        const current = await tx.announcement.findUnique({ where: { id } });
        if (!current) return { status: 404, error: "Not found" } as const;
        if (current.canceled) {
          const [open, globalOpen] = await Promise.all([
            tx.announcement.count({
              where: { operator: current.operator, canceled: false },
            }),
            tx.announcement.count({ where: { canceled: false } }),
          ]);
          if (globalOpen >= MAX_ANNOUNCEMENTS) {
            return { status: 507, error: "Announcement store is full" } as const;
          }
          if (open >= MAX_OPEN_PER_OPERATOR) {
            return {
              status: 429,
              error: `You already have ${MAX_OPEN_PER_OPERATOR} open announcements — cancel one to reopen this`,
            } as const;
          }
        }
      }
      const updated = await tx.announcement.update({ where: { id }, data: parsed.value });
      return { status: 200, updated } as const;
    },
    // Count-then-write needs Serializable: under Postgres's default Read
    // Committed, concurrent reopens could all read below-cap counts.
    { isolationLevel: "Serializable" },
  );
  if (result.status !== 200) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({ announcement: announcementDto(result.updated) });
}
