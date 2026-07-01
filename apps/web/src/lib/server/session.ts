import { cookies } from "next/headers";
import { getIronSession, type IronSession } from "iron-session";
import { prisma } from "@/lib/db";

export interface SessionData {
  nonce?: string;
  address?: string; // lowercased, set after a successful SIWE verify
}

const password =
  process.env.SESSION_SECRET ??
  "dev-only-insecure-session-secret-change-me-please-32b"; // ≥32 chars; override in prod

const cookieName = "scatterdrop_session";

export async function getSession(): Promise<IronSession<SessionData>> {
  return getIronSession<SessionData>(await cookies(), {
    password,
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
