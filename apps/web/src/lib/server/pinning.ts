/**
 * IPFS pinning seam for proofs.json. Env-gated: with no PINATA_JWT configured
 * (local dev) pinning is skipped and callers fall back to the DB store alone;
 * setting the JWT turns on real pinning with no code change. Swappable for
 * another provider behind the same one-function surface.
 */

const PINATA_PIN_URL = "https://api.pinata.cloud/pinning/pinJSONToIPFS";

/**
 * Pin `content` as JSON and return its CID, or null when pinning isn't
 * configured. Throws on a provider error — callers decide whether that's
 * best-effort or fatal.
 */
export async function pinJson(name: string, content: unknown): Promise<string | null> {
  const jwt = process.env.PINATA_JWT;
  if (!jwt) return null;
  const res = await fetch(PINATA_PIN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${jwt}`,
    },
    body: JSON.stringify({
      pinataMetadata: { name },
      pinataContent: content,
    }),
  });
  if (!res.ok) throw new Error(`Pinning failed: ${res.status}`);
  const data = (await res.json()) as { IpfsHash?: string };
  if (!data.IpfsHash) throw new Error("Pinning returned no CID");
  return data.IpfsHash;
}
