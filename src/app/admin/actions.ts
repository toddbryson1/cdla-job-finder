"use server";

// Server actions for the /admin review queue. Both gated on
// ADMIN_TOKEN matching: the action takes the token in form data,
// re-checks it server-side, then runs the promote/reject paths.
// No session — this matches the page-level token-gating model.

import { revalidatePath } from "next/cache";
import {
  promotePendingCarrier,
  rejectPendingCarrier,
} from "@/lib/carrier-discovery/promote";

interface ActionResult {
  ok: boolean;
  message: string;
}

function checkToken(token: FormDataEntryValue | null): boolean {
  const expected = process.env.ADMIN_TOKEN;
  if (!expected || expected.length < 16) return false;
  return typeof token === "string" && token === expected;
}

export async function approvePendingCarrierAction(
  formData: FormData,
): Promise<ActionResult> {
  if (!checkToken(formData.get("token"))) {
    return { ok: false, message: "invalid token" };
  }
  const pendingCarrierId = formData.get("pendingCarrierId");
  const reviewerEmail = formData.get("reviewerEmail");
  if (typeof pendingCarrierId !== "string" || !pendingCarrierId) {
    return { ok: false, message: "missing pendingCarrierId" };
  }
  if (typeof reviewerEmail !== "string" || !reviewerEmail) {
    return { ok: false, message: "missing reviewerEmail" };
  }

  try {
    const result = await promotePendingCarrier(pendingCarrierId, {
      reviewerEmail,
    });
    revalidatePath("/admin");
    const msg = result.isNewCarrier
      ? `Approved. New carrier ${result.carrierName}: ${result.jobsInserted} jobs inserted, ${result.jobsSkipped} skipped.`
      : `Approved. Existing carrier ${result.carrierName}: ${result.jobsInserted} new, ${result.jobsUpdated} updated, ${result.jobsSkipped} skipped.`;
    return { ok: true, message: msg };
  } catch (err) {
    console.error("[admin/approve] failed:", err);
    return {
      ok: false,
      message: err instanceof Error ? err.message : "promotion failed",
    };
  }
}

export async function rejectPendingCarrierAction(
  formData: FormData,
): Promise<ActionResult> {
  if (!checkToken(formData.get("token"))) {
    return { ok: false, message: "invalid token" };
  }
  const pendingCarrierId = formData.get("pendingCarrierId");
  const reviewerEmail = formData.get("reviewerEmail");
  const reason = formData.get("reason");
  if (typeof pendingCarrierId !== "string" || !pendingCarrierId) {
    return { ok: false, message: "missing pendingCarrierId" };
  }
  if (typeof reviewerEmail !== "string" || !reviewerEmail) {
    return { ok: false, message: "missing reviewerEmail" };
  }
  try {
    await rejectPendingCarrier(
      pendingCarrierId,
      reviewerEmail,
      typeof reason === "string" && reason ? reason : undefined,
    );
    revalidatePath("/admin");
    return { ok: true, message: "Rejected." };
  } catch (err) {
    console.error("[admin/reject] failed:", err);
    return {
      ok: false,
      message: err instanceof Error ? err.message : "reject failed",
    };
  }
}
