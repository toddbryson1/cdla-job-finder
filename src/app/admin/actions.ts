"use server";

// Server actions for the /admin review queue. Both gated on
// ADMIN_TOKEN matching: the action takes the token in form data,
// re-checks it server-side, then runs the promote/reject paths.
// No session — this matches the page-level token-gating model.

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { carriers } from "@/db/schema";
import {
  promotePendingCarrier,
  rejectPendingCarrier,
} from "@/lib/carrier-discovery/promote";
import { validateAndersonQuickbaseConfig } from "@/lib/quickbase/client";

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

/**
 * Repair a carrier's drifted partner_handoff_config straight from the
 * admin drift card — no SQL / Drizzle Studio round-trip. Builds an
 * anderson_quickbase config from the four submitted fields, runs it
 * through the SAME validator the retry sweeper uses, and only writes
 * if it validates. So a save here is, by construction, a config the
 * sweeper will accept on its next pass — the drift row clears.
 *
 * Writes the normalized v.config (not the raw input): extra keys are
 * dropped, the shape is canonical. updatedAt bumps so the change is
 * visible in audits.
 */
export async function updateCarrierHandoffConfigAction(
  formData: FormData,
): Promise<ActionResult> {
  if (!checkToken(formData.get("token"))) {
    return { ok: false, message: "invalid token" };
  }
  const carrierId = formData.get("carrierId");
  if (typeof carrierId !== "string" || !carrierId) {
    return { ok: false, message: "missing carrierId" };
  }

  const field = (name: string): string => {
    const v = formData.get(name);
    return typeof v === "string" ? v.trim() : "";
  };
  const realmHostname = field("realmHostname");
  const appId = field("appId");
  const tableId = field("tableId");
  const defaultRecruiterName = field("defaultRecruiterName");

  const config = {
    handoff_type: "anderson_quickbase" as const,
    quickbase: {
      realm_hostname: realmHostname,
      app_id: appId,
      table_id: tableId,
      ...(defaultRecruiterName
        ? { default_recruiter_name: defaultRecruiterName }
        : {}),
    },
  };

  // Validate BEFORE writing — never persist a config the sweeper would
  // reject. The validator's reason string doubles as the operator's
  // error message.
  const v = validateAndersonQuickbaseConfig(config);
  if (!v.ok) {
    return { ok: false, message: v.reason };
  }

  try {
    const updated = await db
      .update(carriers)
      .set({ partnerHandoffConfig: v.config, updatedAt: new Date() })
      .where(eq(carriers.id, carrierId))
      .returning({ id: carriers.id, name: carriers.name });
    if (updated.length === 0) {
      return { ok: false, message: "carrier not found" };
    }
    revalidatePath("/admin");
    return {
      ok: true,
      message: `Saved. ${updated[0].name} now validates for anderson_quickbase — the drift row clears on refresh.`,
    };
  } catch (err) {
    console.error("[admin/update-handoff-config] failed:", err);
    return {
      ok: false,
      message: err instanceof Error ? err.message : "update failed",
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
