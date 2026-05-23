"use server";

import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { carrierJobs, drivers } from "@/db/schema";
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
  if (!driver || driver.email.toLowerCase() !== session.email) {
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
  const { job } = await authorize(driverId, jobId);
  const parsed = consentSchema.parse({
    tcpa: formData.get("tcpa") ?? undefined,
  });

  await db
    .update(drivers)
    .set({
      stage2ConsentCarrierId: job.carrierId,
      stage2ConsentAt: new Date(),
      stage2ConsentTextVersion: STAGE_2_CONSENT_TEXT_VERSION,
      stage2TcpaOptIn: parsed.tcpa,
    })
    .where(eq(drivers.id, driverId));

  redirect(`/match/${driverId}/${jobId}/apply?step=questions`);
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
