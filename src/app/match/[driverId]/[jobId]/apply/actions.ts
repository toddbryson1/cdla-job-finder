"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import {
  carrierJobs,
  carriers,
  driverCarrierApplications,
  drivers,
  partnerApplicationStages,
} from "@/db/schema";
import {
  isQuickbaseConfigured,
  pushAndersonHandoff,
} from "@/lib/quickbase/client";
import {
  appUrl,
  getStytchClient,
  isStytchConfigured,
  MAGIC_LINK_EXPIRATION_MINUTES,
} from "@/lib/stytch/client";
import { getSessionState } from "@/lib/stytch/session";
import { STAGE_2_CONSENT_TEXT_VERSION } from "./constants";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function authorize(driverId: string, jobId: string) {
  if (!UUID_RE.test(driverId) || !UUID_RE.test(jobId)) {
    redirect("/login");
  }
  const session = await getSessionState();
  if (session.kind !== "ok") {
    redirect(
      `/login?redirect=${encodeURIComponent(`/match/${driverId}/${jobId}/apply`)}`,
    );
  }
  const driver = await db.query.drivers.findFirst({
    where: eq(drivers.id, driverId),
  });
  if (!driver || !driver.email || driver.email.toLowerCase() !== session.email) {
    // Anonymous-intake drivers have email=null; they need to claim
    // identity at /apply before this action runs.
    redirect("/login");
  }
  const job = await db.query.carrierJobs.findFirst({
    where: eq(carrierJobs.id, jobId),
  });
  if (!job) {
    redirect(`/matches/${driverId}`);
  }
  return { driver, job };
}

const consentSchema = z.object({
  tcpa: z
    .string()
    .optional()
    .transform((v) => v === "on" || v === "true"),
});

export async function submitConsent(
  driverId: string,
  jobId: string,
  formData: FormData,
) {
  const { driver, job } = await authorize(driverId, jobId);
  const parsed = consentSchema.parse({
    tcpa: formData.get("tcpa") ?? undefined,
  });

  const now = new Date();

  // Persist most-recent consent on the driver row (legacy quick reference)
  // AND write a per-application history row. The latter is what drives the
  // "You pursued this" badge on /matches and any future analytics.
  await db
    .update(drivers)
    .set({
      stage2ConsentCarrierId: job.carrierId,
      stage2ConsentAt: now,
      stage2ConsentTextVersion: STAGE_2_CONSENT_TEXT_VERSION,
      stage2TcpaOptIn: parsed.tcpa,
    })
    .where(eq(drivers.id, driverId));

  await db
    .insert(driverCarrierApplications)
    .values({
      driverId,
      jobId,
      carrierId: job.carrierId,
      consentedAt: now,
      consentTextVersion: STAGE_2_CONSENT_TEXT_VERSION,
      tcpaOptIn: parsed.tcpa,
    })
    .onConflictDoUpdate({
      target: [
        driverCarrierApplications.driverId,
        driverCarrierApplications.jobId,
      ],
      set: {
        consentedAt: now,
        consentTextVersion: STAGE_2_CONSENT_TEXT_VERSION,
        tcpaOptIn: parsed.tcpa,
      },
    });

  // Skip the questions step if intake already captured the Stage 2 safety
  // answers. Re-asking is annoying and confuses drivers ("I already told you
  // this"). The field schema treats these as Stage 2 fields, but our intake
  // form has been collecting them at Stage 1 — so for those drivers we go
  // straight to qualification.
  const haveStage2Answers =
    driver.tickets3yrCount != null &&
    driver.accidents3yrCount != null &&
    driver.duiEver != null &&
    driver.felonyEver != null;

  // accidents_3yr_at_fault_count isn't collected at intake yet; backfill to
  // 0 when accidents = 0 so we can run qualification without asking.
  const skipQuestions =
    haveStage2Answers &&
    (driver.accidents3yrAtFaultCount != null ||
      driver.accidents3yrCount === 0);

  if (skipQuestions && driver.accidents3yrAtFaultCount == null) {
    await db
      .update(drivers)
      .set({ accidents3yrAtFaultCount: 0 })
      .where(eq(drivers.id, driverId));
  }

  redirect(
    `/match/${driverId}/${jobId}/apply?step=${skipQuestions ? "result" : "questions"}`,
  );
}

const questionsSchema = z
  .object({
    tickets3yrCount: z.coerce.number().int().min(0).max(50),
    accidents3yrCount: z.coerce.number().int().min(0).max(20),
    accidents3yrAtFaultCount: z.coerce.number().int().min(0).max(20),
    duiEver: z.enum(["yes", "no"]).transform((v) => v === "yes"),
    duiMostRecentDate: z
      .string()
      .trim()
      .max(40)
      .optional()
      .transform((v) => (v && v.length > 0 ? v : null)),
    felonyEver: z.enum(["yes", "no"]).transform((v) => v === "yes"),
  })
  .refine((d) => d.accidents3yrAtFaultCount <= d.accidents3yrCount, {
    message: "At-fault accidents can't be more than total accidents.",
    path: ["accidents3yrAtFaultCount"],
  });

function parseMonthYear(input: string): Date | null {
  const trimmed = input.trim();
  const isoMonth = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(trimmed);
  if (isoMonth) {
    const y = Number(isoMonth[1]);
    const m = Number(isoMonth[2]);
    const d = isoMonth[3] ? Number(isoMonth[3]) : 1;
    return new Date(Date.UTC(y, m - 1, d));
  }
  const t = Date.parse(trimmed);
  if (!Number.isNaN(t)) return new Date(t);
  return null;
}

export async function submitQuestions(
  driverId: string,
  jobId: string,
  formData: FormData,
) {
  const { driver, job } = await authorize(driverId, jobId);

  // Require Stage 2 consent for THIS carrier before accepting answers.
  if (
    !driver.stage2ConsentAt ||
    driver.stage2ConsentCarrierId !== job.carrierId
  ) {
    redirect(`/match/${driverId}/${jobId}/apply?step=consent`);
  }

  const parsed = questionsSchema.parse({
    tickets3yrCount: formData.get("tickets3yrCount"),
    accidents3yrCount: formData.get("accidents3yrCount"),
    accidents3yrAtFaultCount: formData.get("accidents3yrAtFaultCount") ?? 0,
    duiEver: formData.get("duiEver"),
    duiMostRecentDate: formData.get("duiMostRecentDate") ?? "",
    felonyEver: formData.get("felonyEver"),
  });

  const duiDate =
    parsed.duiEver && parsed.duiMostRecentDate
      ? parseMonthYear(parsed.duiMostRecentDate)
      : null;

  await db
    .update(drivers)
    .set({
      tickets3yrCount: parsed.tickets3yrCount,
      accidents3yrCount: parsed.accidents3yrCount,
      accidents3yrAtFaultCount: parsed.accidents3yrAtFaultCount,
      duiEver: parsed.duiEver,
      duiMostRecentDate: duiDate ? duiDate.toISOString().slice(0, 10) : null,
      felonyEver: parsed.felonyEver,
    })
    .where(eq(drivers.id, driverId));

  redirect(`/match/${driverId}/${jobId}/apply?step=result`);
}

// Swift two-step capture: the driver pastes their Step 1 confirmation number.
// Full Step 2 link delivery is a separate session; for now we stub the
// acknowledgement and surface the "we'll email it to you" message at the
// result page via ?swift=submitted.
export async function submitSwiftConfirmation(
  driverId: string,
  jobId: string,
  _formData: FormData,
) {
  await authorize(driverId, jobId);
  redirect(`/match/${driverId}/${jobId}/apply?step=result&swift=submitted`);
}

// ----------------------------------------------------------------
// Identity capture — invoked from IdentityCaptureForm when an
// anonymous-intake driver picks a carrier and needs to provide
// contact info before consent. Updates the driver row and fires
// the post-identity flows (candidate email, nurture schedule,
// magic link).
// ----------------------------------------------------------------

const claimIdentitySchema = z.object({
  driverId: z.string().regex(UUID_RE),
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  email: z.string().trim().toLowerCase().email(),
  phone: z
    .string()
    .trim()
    .regex(/^\+?[\d\s().-]{10,}$/, "phone needs at least 10 digits"),
});

export async function claimIdentity(input: {
  driverId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = claimIdentitySchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Invalid input." };
  }
  const d = parsed.data;

  // The cookie-authenticated anonymous driver must match the
  // driverId being claimed (no cross-driver claims).
  const cookieStore = await cookies();
  const cookieDriverId = cookieStore.get("cdla_driver_id")?.value;
  if (cookieDriverId !== d.driverId) {
    return { ok: false, error: "Session no longer valid." };
  }

  // Reject if email is already in use by a different driver row
  // (preserves the unique constraint on drivers.email).
  const existingEmailOwner = await db.query.drivers.findFirst({
    where: eq(drivers.email, d.email),
  });
  if (existingEmailOwner && existingEmailOwner.id !== d.driverId) {
    return {
      ok: false,
      error:
        "That email is already on another profile. Sign in instead at /login.",
    };
  }

  const before = await db.query.drivers.findFirst({
    where: eq(drivers.id, d.driverId),
  });
  if (!before) {
    return { ok: false, error: "Driver profile not found." };
  }

  await db
    .update(drivers)
    .set({
      firstName: d.firstName,
      lastName: d.lastName,
      email: d.email,
      phone: d.phone,
    })
    .where(eq(drivers.id, d.driverId));

  // Best-effort: send the Stytch magic link so the driver can come
  // back later without retyping anything. Any failure here is
  // non-fatal — the driver row is already saved.
  if (isStytchConfigured()) {
    try {
      await getStytchClient().magicLinks.email.loginOrCreate({
        email: d.email,
        login_magic_link_url: `${appUrl()}/authenticate`,
        signup_magic_link_url: `${appUrl()}/authenticate`,
        login_expiration_minutes: MAGIC_LINK_EXPIRATION_MINUTES,
        signup_expiration_minutes: MAGIC_LINK_EXPIRATION_MINUTES,
      });
    } catch (err) {
      console.error("[claimIdentity] stytch magic-link send failed:", err);
    }
  }

  // Candidate email + nurture sequence: fire only on first identity
  // claim (i.e. driver row had no email before). Re-claims that just
  // update fields don't re-trigger.
  if (!before.email) {
    void (async () => {
      try {
        const { scheduleNurtureSends } = await import(
          "@/lib/nurture-schedule"
        );
        await scheduleNurtureSends(d.driverId, new Date());
      } catch (err) {
        console.error("[claimIdentity] nurture schedule failed:", err);
      }
    })();
  }

  return { ok: true };
}

// ----------------------------------------------------------------
// Anderson Trucking Service handoff (Sterling Recruiting QuickBase
// push). Invoked from the Stage 2 result step when the carrier's
// partner_handoff_config.handoff_type === 'anderson_quickbase'.
//
// Pattern 1 (spec §B6.2): push to QuickBase immediately when the
// IntelliApp link is delivered (i.e. when the result page renders
// for a qualified driver). Sterling sees the driver up front and
// can reach out proactively, whether or not the driver finishes the
// IntelliApp.
//
// Best-effort: never throws back to the caller. The IntelliApp link
// still renders regardless of whether this succeeds. Stage
// transitions follow spec §B6.3:
//   2xx → submitted_to_sterling
//   4xx → submit_failed_validation
//   5xx / network → submit_queued_for_retry
//   not configured → stays at intelliapp_link_sent (push deferred)
// ----------------------------------------------------------------

export async function recordAndersonHandoff(
  driverId: string,
  jobId: string,
): Promise<void> {
  try {
    if (!UUID_RE.test(driverId) || !UUID_RE.test(jobId)) return;

    const driver = await db.query.drivers.findFirst({
      where: eq(drivers.id, driverId),
    });
    if (!driver) return;

    const job = await db.query.carrierJobs.findFirst({
      where: eq(carrierJobs.id, jobId),
    });
    if (!job) return;

    const carrier = await db.query.carriers.findFirst({
      where: eq(carriers.id, job.carrierId),
    });
    if (!carrier) return;

    // Only proceed for carriers whose handoff config opts in.
    const cfg = (carrier.partnerHandoffConfig ?? null) as Record<
      string,
      unknown
    > | null;
    if (!cfg || cfg.handoff_type !== "anderson_quickbase") return;

    const qbCfg = cfg.quickbase as
      | {
          realm_hostname: string;
          app_id: string;
          table_id: string;
          default_recruiter_name: string;
        }
      | undefined;
    if (
      !qbCfg ||
      typeof qbCfg.realm_hostname !== "string" ||
      typeof qbCfg.app_id !== "string" ||
      typeof qbCfg.table_id !== "string"
    ) {
      return;
    }

    // Upsert the partner_application_stages row at
    // intelliapp_link_sent (Pattern 1 — link has just been rendered).
    const now = new Date();
    const [stageRow] = await db
      .insert(partnerApplicationStages)
      .values({
        driverId,
        carrierJobId: jobId,
        carrierId: job.carrierId,
        stage: "intelliapp_link_sent",
      })
      .onConflictDoUpdate({
        target: [
          partnerApplicationStages.driverId,
          partnerApplicationStages.carrierJobId,
        ],
        set: {
          // Don't downgrade a terminal stage on re-renders — but do
          // refresh updated_at so we can tell from the row when the
          // driver last hit the result page.
          updatedAt: now,
        },
      })
      .returning();

    if (!stageRow) return;

    if (!isQuickbaseConfigured()) {
      // Push is gated on attorney review (spec §B11). The stage row
      // is enough to know which drivers are waiting for the push.
      return;
    }

    // Best-effort push. Errors are folded into the tagged result;
    // pushAndersonHandoff never throws.
    const attemptedAt = new Date();
    const result = await pushAndersonHandoff({
      driver,
      carrierJob: job,
      stage: stageRow,
      quickbaseConfig: {
        realm_hostname: qbCfg.realm_hostname,
        app_id: qbCfg.app_id,
        table_id: qbCfg.table_id,
        default_recruiter_name:
          typeof qbCfg.default_recruiter_name === "string"
            ? qbCfg.default_recruiter_name
            : "Todd Bryson",
      },
    });

    if (result.ok) {
      await db
        .update(partnerApplicationStages)
        .set({
          stage: "submitted_to_sterling",
          quickbaseRecordId: result.recordId,
          quickbasePushAttemptedAt: attemptedAt,
          quickbasePushSucceededAt: new Date(),
          quickbasePushAttempts: sql`${partnerApplicationStages.quickbasePushAttempts} + 1`,
          quickbaseLastError: null,
          updatedAt: new Date(),
        })
        .where(eq(partnerApplicationStages.id, stageRow.id));
      return;
    }

    if (result.code === "not_configured") return; // shouldn't reach here

    const nextStage: "submit_failed_validation" | "submit_queued_for_retry" =
      result.code === "no_retry" || result.code === "auth"
        ? "submit_failed_validation"
        : "submit_queued_for_retry";

    await db
      .update(partnerApplicationStages)
      .set({
        stage: nextStage,
        quickbasePushAttemptedAt: attemptedAt,
        quickbasePushAttempts: sql`${partnerApplicationStages.quickbasePushAttempts} + 1`,
        quickbaseLastError: result.error,
        updatedAt: new Date(),
      })
      .where(eq(partnerApplicationStages.id, stageRow.id));
  } catch (err) {
    // Best-effort — never throws to the user. The IntelliApp link
    // still renders even if we couldn't track the handoff.
    console.error("[recordAndersonHandoff] failed:", err);
  }
}
