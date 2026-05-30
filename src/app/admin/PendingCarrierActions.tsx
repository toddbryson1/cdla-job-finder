"use client";

import { useState } from "react";
import {
  approvePendingCarrierAction,
  rejectPendingCarrierAction,
} from "./actions";

interface Props {
  pendingCarrierId: string;
  carrierName: string;
  status: string;
  /** The admin's token, threaded through so the server can re-check. */
  token: string;
}

export function PendingCarrierActions({
  pendingCarrierId,
  carrierName,
  status,
  token,
}: Props) {
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [reviewerEmail, setReviewerEmail] = useState("");
  const [rejectReason, setRejectReason] = useState("");

  if (status !== "pending") {
    return (
      <span className="text-xs uppercase tracking-wide text-brand-muted">
        {status}
      </span>
    );
  }

  async function onApprove() {
    if (!reviewerEmail) {
      setFeedback("Enter your email first.");
      return;
    }
    if (
      !confirm(
        `Promote ${carrierName} and all its discovered jobs into the live carriers table?`,
      )
    ) {
      return;
    }
    setPending(true);
    setFeedback(null);
    const fd = new FormData();
    fd.set("pendingCarrierId", pendingCarrierId);
    fd.set("reviewerEmail", reviewerEmail);
    fd.set("token", token);
    const res = await approvePendingCarrierAction(fd);
    setPending(false);
    setFeedback(res.message);
  }

  async function onReject() {
    if (!reviewerEmail) {
      setFeedback("Enter your email first.");
      return;
    }
    setPending(true);
    setFeedback(null);
    const fd = new FormData();
    fd.set("pendingCarrierId", pendingCarrierId);
    fd.set("reviewerEmail", reviewerEmail);
    fd.set("reason", rejectReason);
    fd.set("token", token);
    const res = await rejectPendingCarrierAction(fd);
    setPending(false);
    setFeedback(res.message);
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="email"
          placeholder="your@email"
          value={reviewerEmail}
          onChange={(e) => setReviewerEmail(e.target.value)}
          disabled={pending}
          className="h-7 rounded border border-brand-rule bg-white px-2 text-xs text-brand-ink w-40"
        />
        <button
          type="button"
          onClick={onApprove}
          disabled={pending || !reviewerEmail}
          className="h-7 rounded bg-brand-deep px-3 text-xs font-medium text-white hover:bg-brand-medium disabled:opacity-50"
        >
          Approve
        </button>
        <button
          type="button"
          onClick={onReject}
          disabled={pending || !reviewerEmail}
          className="h-7 rounded border border-brand-rule bg-white px-3 text-xs font-medium text-brand-ink hover:bg-brand-surface disabled:opacity-50"
        >
          Reject
        </button>
      </div>
      <input
        type="text"
        placeholder="reject reason (optional)"
        value={rejectReason}
        onChange={(e) => setRejectReason(e.target.value)}
        disabled={pending}
        className="h-7 rounded border border-brand-rule bg-white px-2 text-xs text-brand-muted w-full max-w-xs"
      />
      {feedback ? (
        <span className="text-xs text-brand-muted">{feedback}</span>
      ) : null}
    </div>
  );
}
