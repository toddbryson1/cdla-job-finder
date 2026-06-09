"use client";

import { useState } from "react";
import type { HandoffConfigPrefill } from "@/lib/admin/dashboard-queries";
import { updateCarrierHandoffConfigAction } from "./actions";

interface Props {
  carrierId: string;
  carrierName: string;
  /** Whatever quickbase fields the drifted config still holds, for
   *  pre-fill. */
  current: HandoffConfigPrefill;
  /** The admin's token, threaded through so the server re-checks. */
  token: string;
}

const FIELD_CLASS =
  "h-7 w-full rounded border border-brand-rule bg-white px-2 text-xs text-brand-ink disabled:opacity-50";

export function CarrierHandoffConfigEditor({
  carrierId,
  carrierName,
  current,
  token,
}: Props) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; msg: string } | null>(
    null,
  );
  const [realmHostname, setRealmHostname] = useState(current.realmHostname);
  const [appId, setAppId] = useState(current.appId);
  const [tableId, setTableId] = useState(current.tableId);
  const [defaultRecruiterName, setDefaultRecruiterName] = useState(
    current.defaultRecruiterName,
  );

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="h-7 rounded border border-brand-rule bg-white px-3 text-xs font-medium text-brand-deep hover:bg-brand-surface"
      >
        Edit config
      </button>
    );
  }

  async function onSave() {
    if (!realmHostname.trim() || !appId.trim() || !tableId.trim()) {
      setFeedback({
        ok: false,
        msg: "realm_hostname, app_id, and table_id are all required.",
      });
      return;
    }
    if (
      !confirm(
        `Overwrite ${carrierName}'s partner_handoff_config with these anderson_quickbase values?`,
      )
    ) {
      return;
    }
    setPending(true);
    setFeedback(null);
    const fd = new FormData();
    fd.set("token", token);
    fd.set("carrierId", carrierId);
    fd.set("realmHostname", realmHostname);
    fd.set("appId", appId);
    fd.set("tableId", tableId);
    fd.set("defaultRecruiterName", defaultRecruiterName);
    const res = await updateCarrierHandoffConfigAction(fd);
    setPending(false);
    setFeedback({ ok: res.ok, msg: res.message });
  }

  return (
    <div className="rounded border border-brand-rule bg-brand-surface p-3">
      <div className="mb-2 text-xs font-medium text-brand-ink">
        Repair handoff config — {carrierName}
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className="text-[11px] uppercase tracking-wide text-brand-muted">
            realm_hostname
          </span>
          <input
            type="text"
            placeholder="example.quickbase.com"
            value={realmHostname}
            onChange={(e) => setRealmHostname(e.target.value)}
            disabled={pending}
            className={FIELD_CLASS}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] uppercase tracking-wide text-brand-muted">
            app_id
          </span>
          <input
            type="text"
            value={appId}
            onChange={(e) => setAppId(e.target.value)}
            disabled={pending}
            className={FIELD_CLASS}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] uppercase tracking-wide text-brand-muted">
            table_id
          </span>
          <input
            type="text"
            value={tableId}
            onChange={(e) => setTableId(e.target.value)}
            disabled={pending}
            className={FIELD_CLASS}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] uppercase tracking-wide text-brand-muted">
            default_recruiter_name (optional)
          </span>
          <input
            type="text"
            value={defaultRecruiterName}
            onChange={(e) => setDefaultRecruiterName(e.target.value)}
            disabled={pending}
            className={FIELD_CLASS}
          />
        </label>
      </div>
      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          onClick={onSave}
          disabled={pending}
          className="h-7 rounded bg-brand-deep px-3 text-xs font-medium text-white hover:bg-brand-medium disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save config"}
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setFeedback(null);
          }}
          disabled={pending}
          className="h-7 rounded border border-brand-rule bg-white px-3 text-xs font-medium text-brand-ink hover:bg-brand-surface disabled:opacity-50"
        >
          Cancel
        </button>
        {feedback ? (
          <span
            className={
              feedback.ok
                ? "text-xs text-brand-deep"
                : "text-xs font-medium text-red-700"
            }
          >
            {feedback.msg}
          </span>
        ) : null}
      </div>
    </div>
  );
}
