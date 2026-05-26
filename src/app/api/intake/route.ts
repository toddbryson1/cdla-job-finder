import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { intakeSchema } from "@/lib/intake-schema";
import { db } from "@/db/client";
import { drivers, zipCodes } from "@/db/schema";
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
    // Upsert on email — one driver row per email. Re-submits update the
    // existing row (Stage 2 consent fields and timestamps are preserved
    // because we don't set them here).
    const values = {
      firstName: d.firstName,
      lastName: d.lastName,
      email: d.email,
      phone: d.phone,
      homeZip: d.homeZip,
      homeLat: zip.lat,
      homeLng: zip.lng,
      cdlState: d.cdlState,
      yearsHeld: String(d.yearsHeld),
      equipmentRun: d.equipmentRun,
      endorsements: d.endorsements,
      otrYears: String(d.otrYears),
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
    const [row] = await db
      .insert(drivers)
      .values(values)
      .onConflictDoUpdate({
        target: drivers.email,
        set: updateValues,
      })
      .returning({ id: drivers.id });

    console.log(
      `[intake] driver ${row?.id} ${d.firstName} ${d.lastName} <${d.email}> wants ${d.desiredEquipment.join(",")} in ${d.desiredRegions.join(",")} (home: ${d.homeTime.join("|")})`,
    );

    // Send a magic link to the email the driver just confirmed so they can
    // reach /matches/[id] without typing it again. Best-effort: a Stytch
    // failure shouldn't block intake — the driver can still log in via the
    // /login flow.
    let magicLinkSent = false;
    if (row?.id && isStytchConfigured()) {
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
    if (row?.id && isGhlConfigured()) {
      void sendCandidateEmail({
        driverId: row.id,
        firstName: d.firstName,
        lastName: d.lastName,
        email: d.email,
        phone: d.phone,
        cdlState: d.cdlState,
      }).catch((err) => {
        console.error("[intake] candidate email send failed:", err);
      });
    }

    return NextResponse.json({
      ok: true,
      driverId: row?.id,
      magicLinkSent,
      email: d.email,
    });
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
