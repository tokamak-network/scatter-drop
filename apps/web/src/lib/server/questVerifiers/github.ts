/**
 * GitHub verifier (docs/SOCIAL-TASK-DESIGN.md §2.2): `GET
 * /user/starred/{owner}/{repo}` — 204 if starred, 404 if not. Unlike
 * Discord/Telegram this must run AS THE USER (there is no bot/app credential
 * that can answer "has user X starred repo Y"), so it re-uses the access
 * token persisted on the binding at OAuth time (oauth/github.ts).
 */

import type { QuestVerifier } from "./types";
import { GITHUB_API, GITHUB_API_HEADERS } from "../githubApi";

export const verifyGithubStarTask: QuestVerifier = async (task, _wallet, binding) => {
  if (!binding || binding.provider !== "github") {
    return { ok: false, reason: "Connect your GitHub account first.", status: 409 };
  }
  if (!binding.accessToken) {
    // Token missing (e.g. row predates this field) — the recipient must
    // re-link, not endlessly fail a check that can never succeed.
    return {
      ok: false,
      reason: "Your GitHub connection needs to be refreshed — link your account again.",
      status: 409,
    };
  }

  const parsed = JSON.parse(task.config);
  const config = typeof parsed === "object" && parsed !== null ? parsed : {};
  const { owner, repo } = config as { owner?: string; repo?: string };
  if (!owner || !repo) {
    return { ok: false, reason: "Task is misconfigured (missing owner/repo).", status: 500 };
  }

  let res: Response;
  try {
    res = await fetch(`${GITHUB_API}/user/starred/${owner}/${repo}`, {
      headers: { ...GITHUB_API_HEADERS, Authorization: `Bearer ${binding.accessToken}` },
    });
  } catch {
    return { ok: false, reason: "Could not reach GitHub — try again later.", status: 502 };
  }

  if (res.status === 204) return { ok: true, evidence: null };
  if (res.status === 404) {
    return { ok: false, reason: `You haven't starred ${owner}/${repo} yet.` };
  }
  if (res.status === 401) {
    return {
      ok: false,
      reason: "Your GitHub connection has expired — link your account again.",
      status: 409,
    };
  }
  return {
    ok: false,
    reason: `GitHub verification failed (${res.status}) — try again later.`,
    status: 502,
  };
};
