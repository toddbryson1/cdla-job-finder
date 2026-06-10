"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { after } from "next/server";
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
  validateAndersonQuickbaseConfig,
} from "@/lib/quickbase/client";
import {
  appUrl,
  getStytchClient,
  isStytchConfigured,
  isStepUpEnabled,
  MAGIC_LINK_EXPIRATION_MINUTES,
  SESSION_COOKIE,
  sessionCookieOptions,
  STEP_UP_OTP_EXPIRATION_MINUTES,
} from "@/lib/stytch/client";
import { getSessionState, type SessionState } from "@/lib/stytch/session";
import {
  sendStepUpSms,
  toE164US,
  verifyStepUpSms,
} from "@/lib/stytch/step-up";
import { recordFunnelEvent } from "@/lib/funnel-events";
import { STAGE_2_CONSENT_TEXT_VERSION } from "./constants";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function authorize(driverId: string, jobId: string) {
  if (!UUID_RE.test(driverId) || !UUID_RE.test(jobId)) {
    redirect("/login");
  }

  const driver = await db.query.drivers.findFirst({
    where: eq(drivers.id, driverId),
  });

  // TWO valid auth paths — MUST mirror the /apply page (and /matches),
  // or the consent submit dead-ends. The page lets a cookie-matching
  // anonymous driver reach the consent screen; if this action then
  // required a Stytch session, "I Agree" would bounce every anonymous
  // driver to /login and the flow would be stuck at step 1.
  //
  //   1. Cookie-path: anonymous driver whose cdla_driver_id cookie matches
  //      AND who has already claimed identity (email set at /apply). The
  //      cookie is sufficient to act on their own row.
  //   2. Stytch email session.
  const cookieStore = await cookies();
  const hasMatchingCookie =
    cookieStore.get("cdla_driver_id")?.value === driverId;

  let session: Extract<SessionState, { kind: "ok" }>;
  if (hasMatchingCookie && driver?.email) {
    session = {
      kind: "ok",
      email: driver.email.toLowerCase(),
      userId: `cookie:${driverId}`,
      // A cookie session has no SMS factor; step-up (when enabled) is an
      // email-session-only flow per the page's gate.
      stepUp: false,
    };
  } else {
    const s = await getSessionState();
    if (s.kind !== "ok") {
      redirect(
        `/login?redirect=${encodeURIComponent(`/match/${driverId}/${jobId}/apply`)}`,
      );
    }
    if (!driver || !driver.email || driver.email.toLowerCase() !== s.email) {
      // Anonymous-intake drivers have email=null; they claim identity at
      // /apply before this action runs.
      redirect("/login");
    }
    session = s;
  }

  if (!driver) {
    redirect("/login");
  }

  const job = await db.query.carrierJobs.findFirst({
    where: eq(carrierJobs.id, jobId),
  });
  if (!job) {
    redirect(`/matches/${driverId}`);
  }
  return { driver, job, session };
}

// Holds the Stytch phone_id (OTP method_id) between send and verify.
// Short-lived + httpOnly; expires with the code.
const STEP_UP_METHOD_COOKIE = "cdla_stepup_method";

export interface StepUpState {
  phase: "idle" | "sent" | "error";
  error?: string;
}

/** Send an SMS step-up code to the driver's phone on file. */
export async function sendStepUp(
  driverId: string,
  jobId: string,
  _prev: StepUpState,
  _formData: FormData,
): Promise<StepUpState> {
  const { driver } = await authorize(driverId, jobId);
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) {
    redirect(
      `/login?redirect=${encodeURIComponent(`/match/${driverId}/${jobId}/apply`)}`,
    );
  }

  const e164 = toE164US(driver.phone);
  if (!e164) {
    return {
      phase: "error",
      error:
        "We couldn't read the phone number on your file. Contact support so we can verify it.",
    };
  }

  const res = await sendStepUpSms(token, e164);
  if (!res.ok || !res.methodId) {
    return { phase: "error", error: res.error ?? "Could not send the code." };
  }

  store.set(STEP_UP_METHOD_COOKIE, res.methodId, {
    ...sessionCookieOptions(),
    maxAge: STEP_UP_OTP_EXPIRATION_MINUTES * 60,
  });
  return { phase: "sent" };
}

/** Verify the SMS code, elevate the session, return to the consent step. */
export async function verifyStepUp(
  driverId: string,
  jobId: string,
  _prev: StepUpState,
  formData: FormData,
): Promise<StepUpState> {
  await authorize(driverId, jobId);
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  const methodId = store.get(STEP_UP_METHOD_COOKIE)?.value;
  if (!token) {
    redirect(
      `/login?redirect=${encodeURIComponent(`/match/${driverId}/${jobId}/apply`)}`,
    );
  }
  if (!methodId) {
    return {
      phase: "error",
      error: "Your code expired. Request a new one.",
    };
  }

  const code = String(formData.get("code") ?? "").replace(/\D/g, "");
  if (code.length < 4) {
    // Keep the code-entry UI up — the code was already sent.
    return { phase: "sent", error: "Enter the code we texted you." };
  }

  const res = await verifyStepUpSms(token, methodId, code);
  if (!res.ok || !res.newSessionToken) {
    return { phase: "sent", error: res.error ?? "That code didn't work." };
  }

  // Re-set the rotated session token and clear the method cookie.
  store.set(SESSION_COOKIE, res.newSessionToken, sessionCookieOptions());
  store.set(STEP_UP_METHOD_COOKIE, "", {
    ...sessionCookieOptions(),
    maxAge: 0,
  });
  redirect(`/match/${driverId}/${jobId}/apply?step=consent`);
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
  const { driver, job, session } = await authorize(driverId, jobId);

  // Step-up gate (attorney addendum Q10): when enabled, the session must
  // carry an SMS factor before consent records. Un-stepped-up sessions
  // bounce back to the consent step, which renders the step-up screen.
  if (isStepUpEnabled() && !session.stepUp) {
    redirect(`/match/${driverId}/${jobId}/apply?step=consent`);
  }

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

  // Best-effort funnel event: this driver completed Stage 2 consent for
  // this carrier. Pairs with matches_viewed to give a view→consent
  // funnel from the event log. Scheduled via after() so it survives the
  // redirect() this action issues moments later (a bare `void` would be
  // abandoned when the NEXT_REDIRECT unwind / response flush happens on
  // serverless). after() runs even when redirect is called.
  after(() =>
    recordFunnelEvent({
      eventType: "consent_submitted",
      driverId,
      carrierId: job.carrierId,
      metadata: { jobId, tcpa: parsed.tcpa },
    }),
  );

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
  addressStreet: z
    .string()
    .trim()
    .min(2, "Street address needs at least 2 characters")
    .max(120),
  addressCity: z.string().trim().min(1).max(80),
  addressState: z
    .string()
    .trim()
    .toUpperCase()
    .length(2, "Use the 2-letter state code"),
});

export async function claimIdentity(input: {
  driverId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  addressStreet: string;
  addressCity: string;
  addressState: string;
}): Promise<
  { ok: true } | { ok: false; error: string; emailConflict?: boolean }
> {
  const parsed = claimIdentitySchema.safeParse(input);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return {
      ok: false,
      error: first?.message ?? "Invalid input.",
    };
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
      emailConflict: true,
      error:
        "Looks like you've already got a profile with that email. Sign in and you can pick right back up.",
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
      addressStreet: d.addressStreet,
      addressCity: d.addressCity,
      addressState: d.addressState,
    })
    .where(eq(drivers.id, d.driverId));

  // Best-effort: send the Stytch magic link so the driver can come
  // back later without retyping anything. Any failure here is
  // non-fatal — the driver row is already saved.
  //
  // Fire-and-forget intentionally. We were awaiting this on the
  // request path which, when Stytch was slow / unreachable, made
  // the server action hang for the full upstream timeout — the
  // client sat on "Saving..." because useTransition's pending state
  // didn't clear until the action returned. Magic-link delivery is
  // best-effort copy in the consent paragraph; failing to send it
  // shouldn't block navigation to the consent step.
  if (isStytchConfigured()) {
    void (async () => {
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
    })();
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

    // Only proceed for carriers whose handoff config opts in. Same
    // predicate as the retry sweeper and the admin drift card — see
    // validateAndersonQuickbaseConfig. Drift here is silent: the
    // driver still gets the IntelliApp link from the result page;
    // we just don't queue a Sterling push for them.
    const validation = validateAndersonQuickbaseConfig(
      carrier.partnerHandoffConfig,
    );
    if (!validation.ok) return;
    const qbCfg = validation.config.quickbase;

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

    // Spec §B6.3 idempotency:
    //   - submitted_to_sterling   → terminal success; re-pushing would
    //                               create a duplicate Sterling record.
    //   - submit_failed_validation → terminal failure (4xx/auth); spec
    //                                explicitly forbids auto-retry.
    //   - stalled                 → operator-terminal abandonment.
    // Page-render re-fires for any of those should be a no-op so the
    // driver can revisit the result page (refresh, back-button) without
    // re-triggering the handoff. Only intelliapp_link_sent and
    // submit_queued_for_retry should attempt a push.
    if (
      stageRow.stage === "submitted_to_sterling" ||
      stageRow.stage === "submit_failed_validation" ||
      stageRow.stage === "stalled"
    ) {
      return;
    }

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
        default_recruiter_name: qbCfg.default_recruiter_name ?? "Todd Bryson",
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

    const isTerminal = result.code === "no_retry" || result.code === "auth";
    const nextStage: "submit_failed_validation" | "submit_queued_for_retry" =
      isTerminal ? "submit_failed_validation" : "submit_queued_for_retry";

    // Compute the next retry time for queueable failures so the
    // sweeper (src/lib/quickbase/retry-sweeper.ts) can pick it up
    // when the spec §B6.3 backoff window elapses. Initial failure
    // → attempt 1 → 5min from now. Terminal failures clear the
    // retry timestamp so the sweeper skips them.
    const { nextRetryAt } = await import("@/lib/quickbase/retry-schedule");
    const nextAttempts = stageRow.quickbasePushAttempts + 1;
    const nextAt = isTerminal ? null : nextRetryAt(nextAttempts, new Date());

    await db
      .update(partnerApplicationStages)
      .set({
        stage: nextStage,
        quickbasePushAttemptedAt: attemptedAt,
        quickbasePushAttempts: sql`${partnerApplicationStages.quickbasePushAttempts} + 1`,
        quickbaseLastError: result.error,
        quickbaseNextRetryAt: nextAt,
        updatedAt: new Date(),
      })
      .where(eq(partnerApplicationStages.id, stageRow.id));
  } catch (err) {
    // Best-effort — never throws to the user. The IntelliApp link
    // still renders even if we couldn't track the handoff.
    console.error("[recordAndersonHandoff] failed:", err);
  }
}
