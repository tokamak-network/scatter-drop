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

  // Fast path: prune only this IP's bucket so the request path stays O(1)
  // instead of scanning every tracked IP on each call (which would let a flood
  // of unique IPs block the event loop).
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= limit) return true;
  recent.push(now);
  hits.set(ip, recent);

  // Occasionally sweep the whole map so idle buckets can't leak unbounded.
  if (Math.random() < 0.01) {
    for (const [key, ts] of hits) {
      if (ts.every((t) => now - t >= windowMs)) hits.delete(key);
    }
  }
  return false;
}
