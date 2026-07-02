/**
 * Shared guards for operator-facing API routes (snapshot, Dune import, …).
 * Kept in a neutral module so a route doesn't have to reach into a sibling
 * feature's file — and its heavier deps — just to rate-limit or auth-gate.
 */

/**
 * Optional shared-secret gate. When SNAPSHOT_API_SECRET is set, callers must
 * send `Authorization: Bearer <secret>`; when unset the routes are open (dev
 * default — abuse is bounded by the per-IP rate limit). Returns an error string
 * when the request should be rejected, else null. (A full operator-session auth
 * — SIWE, see M3 — is the production path.)
 */
export function apiAuthError(authHeader: string | null): string | null {
  const secret = process.env.SNAPSHOT_API_SECRET;
  if (!secret) return null;
  return authHeader === `Bearer ${secret}` ? null : "Unauthorized";
}

// --- naive per-IP rate limit (in-memory sliding window) ---
const hits = new Map<string, number[]>();

export function rateLimited(ip: string, limit = 5, windowMs = 60_000): boolean {
  const now = Date.now();
  // Prune stale buckets each call so the map can't grow unbounded.
  for (const [key, ts] of hits) {
    const live = ts.filter((t) => now - t < windowMs);
    if (live.length === 0) hits.delete(key);
    else hits.set(key, live);
  }
  const recent = hits.get(ip) ?? [];
  if (recent.length >= limit) return true;
  recent.push(now);
  hits.set(ip, recent);
  return false;
}
