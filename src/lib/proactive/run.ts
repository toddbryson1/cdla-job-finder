// Proactive-contact orchestrator. Ties the governance spine to the
// (disabled) send path and persists every decision to
// driver_proactive_contacts for audit + future governance reads.
//
// SENDS ARE DISABLED. With PROACTIVE_SENDS_ENABLED off (the default and
// current state — A2P 10DLC not live), an allowed contact is recorded as
// 'blocked_disabled' and NOTHING is delivered. The governance spine still
// runs first, so suppression logic is exercised and tested before any
// channel is wired. Enabling the flag without implementing the channel
// below fails loudly rather than silently pretending to send.

import { and, eq, gte, sql } from "drizzle-orm";
import { db as defaultDb } from "@/db/client";
import { driverProactiveContacts, drivers } from "@/db/schema";
import { PROACTIVE_CONFIG } from "./config";
import { governProactiveContact, type ContactHistory } from "./governance";
import { isProactiveSendsEnabled } from "./flags";
import type { ProactiveCandidate } from "./triggers";

export interface ProactiveOutcome {
  status: "sent" | "suppressed" | "blocked_disabled";
  skipReason: string | null;
}

/**
 * Load the governance-relevant history for a driver: how many proactive
 * contacts in the window, the last one's time, consecutive-ignored count,
 * and the permanent stop flags (unsubscribed / deleted).
 */
export async function loadContactHistory(
  driverId: string,
  now: Date,
  database: typeof defaultDb = defaultDb,
): Promise<ContactHistory> {
  const windowStart = new Date(
    now.getTime() - PROACTIVE_CONFIG.windowDays * 24 * 60 * 60 * 1000,
  );

  const driver = await database.query.drivers.findFirst({
    where: eq(drivers.id, driverId),
    columns: { unsubscribedAt: true, deletedAt: true },
  });

  const windowRows = (await database.execute(sql`
    SELECT COUNT(*)::int AS n,
           MAX(sent_at) AS last_sent
    FROM driver_proactive_contacts
    WHERE driver_id = ${driverId}
      AND status = 'sent'
      AND created_at >= ${windowStart.toISOString()}
  `)) as unknown as Array<{ n: number; last_sent: string | null }>;

  // Consecutive ignored — proactive 'sent' rows with no engagement. We
  // don't yet track per-message engagement, so this is 0 until that
  // signal exists; the gate is wired and tested for when it does.
  const consecutiveIgnored = 0;

  const row = windowRows[0] ?? { n: 0, last_sent: null };
  return {
    contactsInWindow: row.n,
    lastContactAt: row.last_sent ? new Date(row.last_sent) : null,
    consecutiveIgnored,
    unsubscribed: driver?.unsubscribedAt != null,
    deleted: driver?.deletedAt != null,
  };
}

/**
 * Run one proactive candidate through governance + the send guard and
 * persist the decision. Never throws on a suppressed/disabled path.
 */
export async function processProactiveCandidate(
  driverId: string,
  candidate: ProactiveCandidate,
  channel: "sms" | "email",
  now: Date,
  database: typeof defaultDb = defaultDb,
): Promise<ProactiveOutcome> {
  const history = await loadContactHistory(driverId, now, database);
  const decision = governProactiveContact(history, now);

  if (!decision.allowed) {
    await insertContact(database, {
      driverId,
      candidate,
      channel,
      status: "suppressed",
      skipReason: decision.suppressReason ?? null,
      sentAt: null,
    });
    return { status: "suppressed", skipReason: decision.suppressReason ?? null };
  }

  // Governance cleared. The SEND GATE: disabled by default.
  if (!isProactiveSendsEnabled()) {
    await insertContact(database, {
      driverId,
      candidate,
      channel,
      status: "blocked_disabled",
      skipReason: "sends_disabled",
      sentAt: null,
    });
    return { status: "blocked_disabled", skipReason: "sends_disabled" };
  }

  // Enabled path — deliver via the channel, then record 'sent'. The
  // channel itself is intentionally not implemented here: 10DLC isn't
  // live, so reaching this with the flag on must fail loudly, not
  // silently pretend. Wire deliverProactiveContact() at channel go-live.
  await deliverProactiveContact(driverId, candidate, channel);
  await insertContact(database, {
    driverId,
    candidate,
    channel,
    status: "sent",
    skipReason: null,
    sentAt: now,
  });
  return { status: "sent", skipReason: null };
}

async function insertContact(
  database: typeof defaultDb,
  args: {
    driverId: string;
    candidate: ProactiveCandidate;
    channel: "sms" | "email";
    status: ProactiveOutcome["status"];
    skipReason: string | null;
    sentAt: Date | null;
  },
): Promise<void> {
  await database.insert(driverProactiveContacts).values({
    driverId: args.driverId,
    triggerType: args.candidate.triggerType,
    reason: args.candidate.reason,
    channel: args.channel,
    status: args.status,
    skipReason: args.skipReason,
    materialityDetail: args.candidate.materialityDetail,
    sentAt: args.sentAt,
  });
}

// Channel delivery — NOT implemented. 10DLC SMS registration must be live
// before this is wired. Throwing here guarantees enabling the flag
// without finishing the channel fails loudly instead of silently
// dropping (or worse, half-sending) proactive messages.
async function deliverProactiveContact(
  _driverId: string,
  _candidate: ProactiveCandidate,
  _channel: "sms" | "email",
): Promise<void> {
  throw new Error(
    "Proactive channel delivery is not implemented. PROACTIVE_SENDS_ENABLED " +
      "must stay off until the A2P 10DLC channel is wired here.",
  );
}

/**
 * Daily proactive sweep, called from the master cron. Build-disabled: it
 * computes candidates and records decisions, but with sends off nothing
 * is delivered. Currently evaluates the milestone check-in (the trigger
 * computable from stored profile alone) for re-match-eligible drivers.
 * Returns a summary for the cron's run log.
 */
export async function runProactiveSweep(
  now: Date,
  database: typeof defaultDb = defaultDb,
): Promise<{ considered: number; sent: number; suppressed: number; blocked: number }> {
  // Import here to avoid a static import cycle through the matching layer.
  const { evaluateMilestone } = await import("./triggers");

  const eligible = await database.query.drivers.findMany({
    where: and(
      eq(drivers.reMatchEligible, true),
      // never act on deleted/unsubscribed rows
      sql`${drivers.deletedAt} IS NULL`,
      sql`${drivers.unsubscribedAt} IS NULL`,
      gte(drivers.yearsHeld, "0"),
    ),
    columns: { id: true, yearsHeld: true },
    limit: 500,
  });

  let sent = 0;
  let suppressed = 0;
  let blocked = 0;

  for (const d of eligible) {
    const candidate = evaluateMilestone({
      experienceMonths: Math.round(Number(d.yearsHeld) * 12),
    });
    if (!candidate) continue;
    const outcome = await processProactiveCandidate(
      d.id,
      candidate,
      "sms",
      now,
      database,
    );
    if (outcome.status === "sent") sent += 1;
    else if (outcome.status === "suppressed") suppressed += 1;
    else blocked += 1;
  }

  return { considered: eligible.length, sent, suppressed, blocked };
}
