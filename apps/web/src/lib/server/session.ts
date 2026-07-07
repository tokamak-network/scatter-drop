import { cookies } from "next/headers";
import { getIronSession, type IronSession } from "iron-session";
import { prisma } from "@/lib/db";

export interface SessionData {
  nonce?: string;
  address?: string; // lowercased, set after a successful SIWE verify
  // In-flight social OAuth (quests): CSRF state + where to land afterwards.
  // Session-stored so the callback can only complete a flow this browser
  // started (docs/SOCIAL-TASK-DESIGN.md §4②).
  oauthState?: string;
  oauthReturnTo?: string;
}

const cookieName = "scatterdrop_session";

/**
 * Session cookie password. In production a real ≥32-char SESSION_SECRET is
 * mandatory — never fall back to a hard-coded value there (forgeable sessions).
 * The dev fallback only applies outside production.
 */
function sessionPassword(): string {
  const s = process.env.SESSION_SECRET;
  if (s && s.length >= 32) return s;
  if (process.env.NODE_ENV === "production") {
    throw new Error("SESSION_SECRET (≥32 chars) is required in production");
  }
  return "dev-only-insecure-session-secret-change-me-please-32b";
}

export async function getSession(): Promise<IronSession<SessionData>> {
  return getIronSession<SessionData>(await cookies(), {
    password: sessionPassword(),
    cookieName,
    cookieOptions: { secure: process.env.NODE_ENV === "production", sameSite: "lax" },
  });
}

/** True when `address` is on the platform-admin allow-list. */
export async function isPlatformAdmin(address?: string): Promise<boolean> {
  if (!address) return false;
  const row = await prisma.platformAdmin.findUnique({
    where: { address: address.toLowerCase() },
  });
  return !!row;
}

/** The signed-in wallet if it's a platform admin, else null. */
export async function requireAdmin(): Promise<string | null> {
  const session = await getSession();
  if (session.address && (await isPlatformAdmin(session.address))) return session.address;
  return null;
}

/**
 * Any SIWE-signed-in wallet (lowercased), else null. For operator-facing
 * writes (e.g. announcements) that need a verified author but not the
 * platform-admin allow-list.
 */
export async function requireWallet(): Promise<string | null> {
  const session = await getSession();
  return session.address ?? null;
}
