"use client";

import { useState } from "react";
import { useChainId } from "wagmi";
import { useQueryClient } from "@tanstack/react-query";
import { Pencil } from "lucide-react";
import { inkBtnClass, POP_LABEL, POP_PANEL, popInputClass, whiteBtnClass } from "@/components/pop";
import { editCampaignMeta } from "@/lib/campaignMeta";
import type { Campaign } from "@/lib/stub";
import { useWalletSession } from "@/lib/useWalletSession";

/**
 * Operator-only inline editor for the campaign's off-chain name/description
 * (manage Overview). Also the backfill path for campaigns created before the
 * metadata store existed — the PATCH upserts after on-chain operator proof.
 */
export function MetaEditor({ campaign }: { campaign: Campaign }) {
  const chainId = useChainId();
  const queryClient = useQueryClient();
  const { ensureSession } = useWalletSession(
    "Sign in to scatter.drop to edit your campaign's details.",
  );
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(campaign.name);
  const [description, setDescription] = useState(campaign.description ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setError(null);
    if (!name.trim()) {
      setError("Name is required.");
      return;
    }
    setSaving(true);
    try {
      const session = await ensureSession(campaign.operator);
      if (!session) {
        setError("Sign-in was cancelled.");
        return;
      }
      const err = await editCampaignMeta({
        chainId,
        drop: campaign.drop,
        name: name.trim(),
        description: description.trim(),
      });
      if (err) {
        setError(err);
        return;
      }
      // Name/description render everywhere campaigns do — refetch them all
      // (prefix matching: "campaigns" does NOT cover "managedCampaigns").
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["campaign"] }),
        queryClient.invalidateQueries({ queryKey: ["campaigns"] }),
        queryClient.invalidateQueries({ queryKey: ["managedCampaigns"] }),
      ]);
      setEditing(false);
    } catch {
      // e.g. a rejected wallet signature — surface it instead of an
      // unhandled rejection with a silently-stuck form.
      setError("Save failed — please retry.");
    } finally {
      setSaving(false);
    }
  };

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => {
          setName(campaign.name);
          setDescription(campaign.description ?? "");
          setEditing(true);
        }}
        className="inline-flex items-center gap-1.5 text-[11px] font-bold text-ink/60 hover:text-ink transition"
      >
        <Pencil className="w-3 h-3" /> Edit name &amp; description
      </button>
    );
  }

  return (
    <div className={`bg-white p-5 space-y-3 max-w-xl ${POP_PANEL}`}>
      <label className={POP_LABEL}>
        Name
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={80}
          className={popInputClass("mt-1 px-3 py-2 rounded-xl")}
        />
      </label>
      <label className={POP_LABEL}>
        Description
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={400}
          rows={2}
          className={popInputClass("mt-1 px-3 py-2 rounded-xl")}
        />
      </label>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className={`text-xs disabled:opacity-50 ${inkBtnClass("sm")}`}
        >
          {saving ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          onClick={() => setEditing(false)}
          disabled={saving}
          className={`text-xs disabled:opacity-50 ${whiteBtnClass("sm")}`}
        >
          Cancel
        </button>
      </div>
      {error && <p className="text-xs text-rose-500">{error}</p>}
    </div>
  );
}
