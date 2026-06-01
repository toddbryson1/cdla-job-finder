import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { intakeSchema } from "@/lib/intake-schema";
import { db } from "@/db/client";
import { drivers, zipCodes } from "@/db/schema";
import { scheduleNurtureSends } from "@/lib/nurture-schedule";
import {
  appUrl,
  getStytchClient,
  isStytchConfigured,
  MAGIC_LINK_EXPIRATION_MINUTES,
} from "@/lib/stytch/client";
import { matchDriver } from "@/lib/matching";
import {
  isGhlConfigured,
  sendEmail,
  upsertContact,
} from "@/lib/ghl/client";
import { candidateEmail } from "@/lib/ghl/candidateEmail";
import { resolveRegion } from "@/lib/regions";

export const runtime = "nodejs";

function tryParseDuiDate(input: string): string | null {
  // Intake currently captures DUI date as free text ("March 2019"). Stage 2
  // will collect a structured date. Try a permissive parse here so we can
  // populate the nullable `dui_most_recent_date` column when the user gave a
  // recognizable date; otherwise leave it null.
  if (!input || !input.trim()) return null;
  const d = new Date(input.trim());
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

export async function POST(request: Request) {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = intakeSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Validation failed",
        issues: parsed.error.issues.map((i) => ({ path: i.path, message: i.message })),
      },
      { status: 400 },
    );
  }

  const d = parsed.data;

  const zip = await db.query.zipCodes.findFirst({
    where: eq(zipCodes.zip, d.homeZip),
  });
  if (!zip) {
    return NextResponse.json(
      {
        error: "Validation failed",
        issues: [
          {
            path: ["homeZip"],
            message:
              "We could not find that zip code. Double-check it is a 5-digit US zip.",
          },
        ],
      },
      { status: 400 },
    );
  }

  try {
    // When email is provided we upsert on it (one driver row per
    // email). When intake is anonymous (email null), we always
    // insert a fresh row — the caller gets the new id back via
    // cookie and can claim contact info later at /apply time.
    const isAnonymousIntake = !d.email;

    const values = {
      firstName: d.firstName ?? null,
      lastName: d.lastName ?? null,
      email: d.email ?? null,
      phone: d.phone ?? null,
      homeZip: d.homeZip,
      homeLat: zip.lat,
      homeLng: zip.lng,
      cdlState: d.cdlState,
      yearsHeld: String(d.yearsHeld),
      equipmentRun: d.equipmentRun,
      endorsements: d.endorsements,
      otrYears: String(d.otrYears),
      totalCareerExperienceMonths: d.totalCareerExperienceMonths,
      monthsSinceLastDrove: d.monthsSinceLastDrove,
      desiredEquipment: d.desiredEquipment,
      desiredRegions: d.desiredRegions,
      homeTime: d.homeTime,
      minWeeklyPay: d.minWeeklyPay,
      willingToRelocate: d.willingToRelocate,
      accidents3yrCount: d.accidents3yrCount,
      accidentsDetails: d.accidentsDetails,
      tickets3yrCount: d.tickets3yrCount,
      duiEver: d.duiEver,
      duiMostRecentDate: tryParseDuiDate(d.duiMostRecentDate),
      felonyEver: d.felonyEver,
      felonyDetails: d.felonyDetails,
      terminatedFromAnyOfLast3Employers: d.terminatedFromAnyOfLast3Employers,
      terminationDetails: d.terminationDetails,
      failedDotTest: d.failedDotTest,
      sapStatus: d.sapStatus,
      attestAccurate: d.attestAccurate,
      consentToShare: d.consentToShare,
      smsOptIn: d.smsOptIn,
    };
    // Strip immutable / preserved-on-update fields from the update set.
    const { email: _email, ...updateValues } = values;
    void _email;

    // Anonymous intake: always INSERT (no upsert target). Email-keyed
    // intake: upsert on email so re-submissions update the existing row.
    const [row] = isAnonymousIntake
      ? await db.insert(drivers).values(values).returning({ id: drivers.id })
      : await db
          .insert(drivers)
          .values(values)
          .onConflictDoUpdate({
            target: drivers.email,
            set: updateValues,
          })
          .returning({ id: drivers.id });

    console.log(
      `[intake] driver ${row?.id} ${isAnonymousIntake ? "(anonymous)" : `${d.firstName} ${d.lastName} <${d.email}>`} wants ${d.desiredEquipment.join(",")} in ${d.desiredRegions.join(",")} (home: ${d.homeTime.join("|")})`,
    );

    // Send a magic link to the email the driver just confirmed so they can
    // reach /matches/[id] without typing it again. Best-effort: a Stytch
    // failure shouldn't block intake — the driver can still log in via the
    // /login flow. Skipped entirely for anonymous intake — magic link
    // happens at /apply time after the driver provides their email.
    let magicLinkSent = false;
    if (!isAnonymousIntake && row?.id && isStytchConfigured() && d.email) {
      // No query params on the callback — Stytch validates the full URL
      // against the dashboard allow-list. /authenticate looks the driver
      // up by their verified email and routes to /matches/[id] from there.
      const callback = `${appUrl()}/authenticate`;
      try {
        await getStytchClient().magicLinks.email.loginOrCreate({
          email: d.email,
          login_magic_link_url: callback,
          signup_magic_link_url: callback,
          login_expiration_minutes: MAGIC_LINK_EXPIRATION_MINUTES,
          signup_expiration_minutes: MAGIC_LINK_EXPIRATION_MINUTES,
        });
        magicLinkSent = true;
      } catch (err) {
        console.error("[intake] stytch magic-link send failed:", err);
      }
    }

    // Candidate email per
    // SPEC_candidate-email-and-reverse-match-alerts-v1.md §2 — sent
    // immediately after Stage 1 consent + matching. Two-email pattern for
    // now: Stytch handles auth (above), GHL handles the match-summary
    // candidate email. Best-effort; any failure logs but doesn't block
    // intake. The Stytch token is NOT embedded in this email; the user
    // clicks "see my matches" and hits the auth gate, then signs in via
    // the separate Stytch magic-link email.
    // Both candidate email + nurture sequence only fire when we
    // have an email to send to. Anonymous intake skips both; they
    // get scheduled later at /apply time when the driver provides
    // contact info.
    if (
      !isAnonymousIntake &&
      row?.id &&
      isGhlConfigured() &&
      d.email &&
      d.firstName &&
      d.lastName &&
      d.phone
    ) {
      void sendCandidateEmail({
        driverId: row.id,
        firstName: d.firstName,
        lastName: d.lastName,
        email: d.email,
        phone: d.phone,
        cdlState: d.cdlState,
        homeCity: zip.city,
        homeZip: d.homeZip,
      }).catch((err) => {
        console.error("[intake] candidate email send failed:", err);
      });
    }

    // Schedule the 6-email nurture sequence. Each row is picked up by
    // /api/cron/nurture once scheduled_for passes. Idempotent on
    // (driver_id, email_index): re-submitting intake with the same email
    // (upserts driver) won't duplicate scheduled sends, and won't reset
    // ones already sent. Pending rows get their schedule shifted to the
    // new intake date.
    if (!isAnonymousIntake && row?.id) {
      void scheduleNurtureSends(row.id, new Date()).catch((err) => {
        console.error("[intake] schedule nurture sends failed:", err);
      });
    }

    // Issue an httpOnly cookie carrying the driver_id so anonymous
    // sessions persist across the matches and apply pages without
    // requiring identity. Lifetime 30 days. Clears naturally on
    // browser close if user disables persistent cookies; the
    // /apply page handles re-prompting for matches in that case.
    const response = NextResponse.json({
      ok: true,
      driverId: row?.id,
      magicLinkSent,
      email: d.email ?? null,
    });
    if (row?.id) {
      response.cookies.set("cdla_driver_id", row.id, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 24 * 30, // 30 days
      });
    }
    return response;
  } catch (err) {
    console.error("[intake] insert failed:", err);
    return NextResponse.json(
      { error: "Couldn't save your intake. Try again in a minute." },
      { status: 500 },
    );
  }
}

// Candidate email send — runs matching, upserts GHL contact, sends the
// match-summary email. Pulled out of the request body so it can fail
// silently without breaking the intake response.
async function sendCandidateEmail(input: {
  driverId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  cdlState: string;
  homeCity: string;
  homeZip: string;
}): Promise<void> {
  // Run the matching engine. If it errors, we abort the candidate email
  // rather than send a stale or wrong-counted message (spec §2.9).
  const result = await matchDriver(input.driverId);
  const matchCount = result.matches.length;
  const topCarrierNames = uniqueCarrierNames(result.matches).slice(0, 3);

  // Upsert as a GHL contact so we have a contactId to send to. Tag with
  // the matched count bucket so GHL sequences can segment later.
  const tag =
    matchCount === 0
      ? "driver-zero-matches"
      : matchCount === 1
        ? "driver-1-match"
        : matchCount < 5
          ? "driver-2to4-matches"
          : "driver-5plus-matches";
  const upserted = await upsertContact({
    email: input.email,
    firstName: input.firstName,
    lastName: input.lastName,
    phone: input.phone,
    source: "cdla.jobs /intake",
    tags: ["driver-intake-completed", tag],
    // City and full-name state populate GHL contact fields so nurture
    // email templates can render {{contact.city}} / {{contact.state}}.
    city: input.homeCity,
    state: resolveRegion(input.cdlState),
    postalCode: input.homeZip,
  });

  const matchesUrl = `${appUrl()}/matches/${input.driverId}`;
  const { subject, html } = candidateEmail({
    firstName: input.firstName,
    cdlState: input.cdlState,
    matchCount,
    topCarrierNames,
    matchesUrl,
  });

  await sendEmail({
    contactId: upserted.contactId,
    subject,
    html,
  });

  console.log(
    `[intake] candidate email sent to ${input.email}: ${matchCount} matches`,
  );
}

function uniqueCarrierNames(
  matches: Array<{ carrierName: string }>,
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const m of matches) {
    if (seen.has(m.carrierName)) continue;
    seen.add(m.carrierName);
    out.push(m.carrierName);
  }
  return out;
}

// scheduleNurtureSends moved to @/lib/nurture-schedule so the /apply
// identity-capture path can call the same scheduler when an anonymous
// driver finally provides their email.
