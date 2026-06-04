"use server";

// Server actions for the /admin review queue. Both gated on
// ADMIN_TOKEN matching: the action takes the token in form data,
// re-checks it server-side, then runs the promote/reject paths.
// No session — this matches the page-level token-gating model.

import { timingSafeEqual } from "node:crypto";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { carriers, partnerApplicationStages } from "@/db/schema";
import {
  promotePendingCarrier,
  rejectPendingCarrier,
} from "@/lib/carrier-discovery/promote";
import { validateAndersonQuickbaseConfig } from "@/lib/quickbase/client";

interface ActionResult {
  ok: boolean;
  message: string;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function checkToken(token: FormDataEntryValue | null): boolean {
  const expected = process.env.ADMIN_TOKEN;
  if (!expected || expected.length < 16) return false;
  if (typeof token !== "string") return false;
  // Constant-time compare. Length-mismatch short-circuits (the lengths
  // themselves aren't secret); equal-length inputs go through
  // timingSafeEqual so a correct-length guess can't be timed byte-by-byte.
  const a = Buffer.from(token);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
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
 * True if the carrier is a legitimate handoff-config target — i.e. it
 * already declares an anderson_quickbase handoff OR has at least one
 * partner_application_stages row pointing at it. This is the SAME
 * candidate predicate getCarrierHandoffDrift uses, so the only carriers
 * the editor will write to are exactly the ones it surfaces. Without
 * this, a stray/forged carrierId could stamp an anderson_quickbase
 * config onto an unrelated Tier-2 / Tenstreet carrier and pull it into
 * the QuickBase push path.
 */
async function isHandoffCarrier(
  carrierId: string,
  existingConfig: unknown,
): Promise<boolean> {
  const declaresAnderson =
    !!existingConfig &&
    typeof existingConfig === "object" &&
    (existingConfig as Record<string, unknown>).handoff_type ===
      "anderson_quickbase";
  if (declaresAnderson) return true;
  const stage = await db.query.partnerApplicationStages.findFirst({
    where: eq(partnerApplicationStages.carrierId, carrierId),
    columns: { id: true },
  });
  return !!stage;
}

/**
 * Repair a carrier's drifted partner_handoff_config straight from the
 * admin drift card — no SQL / Drizzle Studio round-trip. Builds an
 * anderson_quickbase config from the four submitted fields, runs it
 * through the SAME validator the retry sweeper uses, and only writes
 * if it validates. So a save here is, by construction, a config the
 * sweeper will accept on its next pass — the drift row clears.
 *
 * MERGES into the existing config rather than replacing it: a handoff
 * config can carry sibling keys the editor doesn't expose (IntelliApp
 * URL, source identifiers, *_secret_ref — see schema.ts:partnerHandoff-
 * Config). A wholesale overwrite would silently wipe those while
 * "repairing" one field. We preserve unknown top-level + quickbase
 * keys and only set the four the operator edited.
 */
export async function updateCarrierHandoffConfigAction(
  formData: FormData,
): Promise<ActionResult> {
  if (!checkToken(formData.get("token"))) {
    return { ok: false, message: "invalid token" };
  }
  const carrierId = formData.get("carrierId");
  if (typeof carrierId !== "string" || !UUID_RE.test(carrierId)) {
    return { ok: false, message: "missing or malformed carrierId" };
  }

  const field = (name: string): string => {
    const v = formData.get(name);
    return typeof v === "string" ? v.trim() : "";
  };
  const realmHostname = field("realmHostname");
  const appId = field("appId");
  const tableId = field("tableId");
  const defaultRecruiterName = field("defaultRecruiterName");

  try {
    const carrier = await db.query.carriers.findFirst({
      where: eq(carriers.id, carrierId),
      columns: { id: true, name: true, partnerHandoffConfig: true },
    });
    if (!carrier) {
      return { ok: false, message: "carrier not found" };
    }
    if (!(await isHandoffCarrier(carrierId, carrier.partnerHandoffConfig))) {
      return {
        ok: false,
        message:
          "Not a handoff carrier — refusing to write anderson_quickbase config here.",
      };
    }

    // Merge: preserve sibling keys the editor doesn't expose, set the
    // four it does. default_recruiter_name is removed when cleared.
    const existing =
      carrier.partnerHandoffConfig &&
      typeof carrier.partnerHandoffConfig === "object"
        ? (carrier.partnerHandoffConfig as Record<string, unknown>)
        : {};
    const existingQb =
      existing.quickbase && typeof existing.quickbase === "object"
        ? (existing.quickbase as Record<string, unknown>)
        : {};
    const mergedQb: Record<string, unknown> = {
      ...existingQb,
      realm_hostname: realmHostname,
      app_id: appId,
      table_id: tableId,
    };
    if (defaultRecruiterName) {
      mergedQb.default_recruiter_name = defaultRecruiterName;
    } else {
      delete mergedQb.default_recruiter_name;
    }
    const merged = {
      ...existing,
      handoff_type: "anderson_quickbase",
      quickbase: mergedQb,
    };

    // Validate the MERGED result before writing — never persist a
    // config the sweeper would reject. Validation is a gate only; we
    // write `merged` (not the validator's narrowed output) so the
    // preserved sibling keys survive.
    const v = validateAndersonQuickbaseConfig(merged);
    if (!v.ok) {
      return { ok: false, message: v.reason };
    }

    await db
      .update(carriers)
      .set({ partnerHandoffConfig: merged, updatedAt: new Date() })
      .where(eq(carriers.id, carrierId));
    revalidatePath("/admin");
    return {
      ok: true,
      message: `Saved. ${carrier.name} now validates for anderson_quickbase — the drift row clears on refresh.`,
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
