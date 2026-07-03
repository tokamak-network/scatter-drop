"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useChainId } from "wagmi";
import type { Address } from "viem";
import { fmtDateTime, useCampaigns } from "./campaigns";
import type { Campaign } from "./stub";

/**
 * Client seam for /api/announcements — the operator-posted "Upcoming Drops"
 * board. Statuses are not stored: an announcement is UPCOMING until its
 * campaign exists, then LIVE/ENDED follow the linked drop's on-chain claim
 * window (the DB can't drift from the chain if it never records the state).
 */

export type AnnouncementStatus = "UPCOMING" | "LIVE" | "ENDED" | "CANCELED";

export interface AnnouncementLink {
  label: string;
  url: string;
}

export interface Announcement {
  id: string;
  chainId: number;
  title: string;
  body: string;
  tokenSymbol: string | null;
  /** ISO datetimes (the API serializes Dates). */
  expectedStart: string;
  expectedEnd: string | null;
  links: AnnouncementLink[];
  /** Lowercased drop address once the campaign is created and linked. */
  drop: string | null;
  canceled: boolean;
  operator: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Derive the lifecycle state. `campaign` is the linked drop's on-chain view
 * (pass it when `a.drop` is set); without it a linked-but-unresolved
 * announcement stays UPCOMING rather than guessing.
 */
export function announcementStatus(
  a: Announcement,
  campaign?: Campaign,
): AnnouncementStatus {
  if (a.canceled) return "CANCELED";
  if (a.drop && campaign) {
    const now = BigInt(Math.floor(Date.now() / 1000));
    if (campaign.startTimeUnix > now) return "UPCOMING";
    return campaign.deadlineUnix >= now ? "LIVE" : "ENDED";
  }
  return "UPCOMING";
}

/** ISO datetime → "YYYY-MM-DD HH:mm" local (expected times are minute-fuzzy). */
export function fmtIsoDateTime(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : fmtDateTime(d, { seconds: false });
}

/** The announced window as a compact one-liner ("start → end" or "from start"). */
export function fmtExpectedWindow(a: Announcement): string {
  const start = fmtIsoDateTime(a.expectedStart);
  return a.expectedEnd ? `${start} → ${fmtIsoDateTime(a.expectedEnd)}` : `from ${start}`;
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" });
  const data = (await res.json()) as T & { error?: string };
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
  return data;
}

/** All announcements for the connected chain, soonest expected start first. */
export function useAnnouncements(operator?: Address, opts?: { enabled?: boolean }) {
  const chainId = useChainId();
  return useQuery({
    queryKey: ["announcements", chainId, operator?.toLowerCase() ?? null],
    staleTime: 15_000,
    enabled: opts?.enabled ?? true,
    queryFn: async () => {
      const query = operator
        ? `chainId=${chainId}&operator=${operator.toLowerCase()}`
        : `chainId=${chainId}`;
      const data = await fetchJson<{ announcements: Announcement[] }>(
        `/api/announcements?${query}`,
      );
      return data.announcements;
    },
  });
}

export type AnnouncementWithStatus = { a: Announcement; status: AnnouncementStatus };

/**
 * Announcements joined with their lifecycle status — resolves the linked
 * drops' on-chain claim windows via the campaign list, so the board and the
 * Explore strip derive LIVE/ENDED the same way.
 */
export function useAnnouncementsWithStatus(operator?: Address) {
  const query = useAnnouncements(operator);
  const { data: campaignData } = useCampaigns();
  const campaigns = campaignData?.campaigns;
  const items = useMemo<AnnouncementWithStatus[]>(() => {
    const byDrop = new Map((campaigns ?? []).map((c) => [c.drop.toLowerCase(), c]));
    return (query.data ?? []).map((a) => ({
      a,
      status: announcementStatus(a, a.drop ? byDrop.get(a.drop) : undefined),
    }));
  }, [query.data, campaigns]);
  return { ...query, items };
}

/** A single announcement (board detail page). */
export function useAnnouncement(id: string) {
  return useQuery({
    queryKey: ["announcement", id],
    staleTime: 15_000,
    enabled: !!id,
    queryFn: async () =>
      (await fetchJson<{ announcement: Announcement }>(`/api/announcements/${id}`))
        .announcement,
  });
}

export interface AnnouncementDraft {
  chainId: number;
  title: string;
  body: string;
  tokenSymbol?: string;
  expectedStart: string;
  expectedEnd?: string | null;
  links?: AnnouncementLink[];
}

async function write(
  url: string,
  method: "POST" | "PATCH",
  payload: unknown,
): Promise<{ announcement?: Announcement; error?: string }> {
  try {
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = (await res.json()) as { announcement?: Announcement; error?: string };
    if (!res.ok) return { error: data.error ?? `Request failed (${res.status})` };
    return data;
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Request failed" };
  }
}

/** Create an announcement (requires a SIWE session — see useWalletSession). */
export function createAnnouncement(draft: AnnouncementDraft) {
  return write("/api/announcements", "POST", draft);
}

/**
 * Operator-only update: edit copy, link/unlink the created drop, or cancel.
 * Pass `txHash` (the drop's creation tx) with a link so the server can verify
 * ownership via one receipt read instead of a log scan.
 */
export function patchAnnouncement(
  id: string,
  patch: Partial<AnnouncementDraft> & {
    drop?: string | null;
    canceled?: boolean;
    txHash?: string;
  },
) {
  return write(`/api/announcements/${id}`, "PATCH", patch);
}
