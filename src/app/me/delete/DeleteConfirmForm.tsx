"use client";

// Two-stage confirmation form. The first click reveals the actual
// destructive button — same pattern GitHub uses for repo deletion.
// Single-click destructive actions on a form button get triggered
// by browser refreshes, double-clicks, and OAuth-style retries
// often enough that this gate is worth the friction.

import { useState, useTransition } from "react";
import { deleteMyData } from "./actions";

export function DeleteConfirmForm() {
  const [armed, setArmed] = useState(false);
  const [pending, startTransition] = useTransition();

  if (!armed) {
    return (
      <button
        type="button"
        onClick={() => setArmed(true)}
        className="inline-flex h-11 items-center justify-center rounded-md border border-red-200 bg-red-50 px-5 text-sm font-semibold text-red-700 hover:bg-red-100 transition-colors"
      >
        I want to delete my data
      </button>
    );
  }

  return (
    <div className="rounded-lg border border-red-200 bg-red-50 p-4">
      <p className="text-sm font-medium text-red-900">
        Last chance. Click below to delete now, or cancel.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              await deleteMyData();
            })
          }
          className="inline-flex h-11 items-center justify-center rounded-md bg-red-600 px-5 text-sm font-semibold text-white shadow-sm hover:bg-red-700 disabled:opacity-50 transition-colors"
        >
          {pending ? "Deleting…" : "Yes, delete my data"}
        </button>
        <button
          type="button"
          onClick={() => setArmed(false)}
          disabled={pending}
          className="inline-flex h-11 items-center justify-center rounded-md border border-brand-rule px-5 text-sm font-medium text-brand-ink hover:bg-brand-paper disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
