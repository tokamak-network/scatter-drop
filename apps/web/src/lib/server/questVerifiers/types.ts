/**
 * Quest verifier adapter contract (docs/SOCIAL-TASK-DESIGN.md §6): every
 * platform module implements `verify(task, wallet, binding)` and the verify
 * route stays platform-agnostic. Completion judgment is SERVER-ONLY — a
 * verifier's `ok` must come from an API call the server made itself, never
 * from anything the client asserted (§3.2).
 */

export interface VerifierTask {
  id: string;
  kind: string;
  /** JSON as stored on QuestTask.config. */
  config: string;
}

/** The wallet's ACTIVE binding for the task's provider (unboundAt = null). */
export interface VerifierBinding {
  provider: string;
  providerAccountId: string;
  wallet: string;
  /** User access token (GitHub only — see WalletSocial.accessToken). */
  accessToken?: string | null;
}

export type VerifyOutcome =
  /** Task completed — `evidence` is the minimal JSON proof to persist. */
  | { ok: true; evidence: string | null }
  /** Not completed (user-facing reason) or not verifiable right now. */
  | { ok: false; reason: string; status?: number };

export type QuestVerifier = (
  task: VerifierTask,
  wallet: string,
  binding: VerifierBinding | null,
) => Promise<VerifyOutcome>;
