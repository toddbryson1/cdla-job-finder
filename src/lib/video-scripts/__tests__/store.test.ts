// DB-backed tests for the video-script tracking store (schema videoScripts,
// migration 0035). Hits real Postgres via DATABASE_URL, same convention as
// funnel-events.test.ts — runs only where a database is reachable.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq, like, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { drivers, funnelEvents, videoScripts } from "@/db/schema";
import {
  listVideoScripts,
  markVideoScriptStatus,
  saveGeneratedScript,
  videoScriptConversions,
} from "@/lib/video-scripts/store";
import type { RenderedScript } from "@/lib/video-scripts";

const SLUG = "test-region-reefer";
const TEST_EMAIL = "vsrc-store-test@example.com";

function makeScript(over: Partial<RenderedScript> = {}): RenderedScript {
  return {
    templateKey: "pay-focused",
    templateName: "Pay-Focused",
    slug: SLUG,
    region: "Test Region, TR",
    equipment: "Reefer",
    body: "TEMPLATE: Pay-Focused\nHook...\n",
    warnings: [],
    variables: { pay_low: "$1,300", pay_high: "$1,900" },
    ...over,
  };
}

async function cleanup() {
  await db.delete(videoScripts).where(like(videoScripts.slug, "test-region-%"));
  // Conversion-test fixtures: funnel events tagged with our test vsrc + the driver.
  await db
    .delete(funnelEvents)
    .where(sql`${funnelEvents.metadata}->>'vsrc' LIKE 'test-region-%'`);
  await db.delete(drivers).where(eq(drivers.email, TEST_EMAIL));
}

beforeEach(cleanup);
afterEach(cleanup);

describe("saveGeneratedScript", () => {
  it("inserts a new script as 'generated'", async () => {
    await saveGeneratedScript(makeScript());
    const rows = await listVideoScripts({ slug: SLUG });
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("generated");
    expect(rows[0].templateKey).toBe("pay-focused");
  });

  it("upserts on (slug, template) — one row per target+template", async () => {
    await saveGeneratedScript(makeScript({ body: "v1" }));
    await saveGeneratedScript(makeScript({ body: "v2" }));
    const rows = await listVideoScripts({ slug: SLUG });
    expect(rows).toHaveLength(1);
  });

  it("preserves production status across re-generation", async () => {
    const id = await saveGeneratedScript(makeScript({ body: "v1" }));
    await markVideoScriptStatus(id, "published", "https://youtu.be/abc");

    // Re-generate (e.g. pay numbers changed) — status must NOT reset.
    await saveGeneratedScript(makeScript({ body: "v2-newpay" }));

    const rows = await listVideoScripts({ slug: SLUG });
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("published");
    expect(rows[0].producedVideoUrl).toBe("https://youtu.be/abc");
  });

  it("keeps distinct templates for the same slug as separate rows", async () => {
    await saveGeneratedScript(makeScript({ templateKey: "pay-focused" }));
    await saveGeneratedScript(makeScript({ templateKey: "anti-indeed" }));
    const rows = await listVideoScripts({ slug: SLUG });
    expect(rows).toHaveLength(2);
  });
});

describe("markVideoScriptStatus", () => {
  it("updates status and returns true", async () => {
    const id = await saveGeneratedScript(makeScript());
    const ok = await markVideoScriptStatus(id, "in_production");
    expect(ok).toBe(true);
    const rows = await listVideoScripts({ status: "in_production" });
    expect(rows.some((r) => r.id === id)).toBe(true);
  });

  it("returns false for an unknown id", async () => {
    const ok = await markVideoScriptStatus(
      "00000000-0000-0000-0000-000000000000",
      "archived",
    );
    expect(ok).toBe(false);
  });
});

describe("videoScriptConversions", () => {
  it("counts distinct intakes attributed to a script via vsrc", async () => {
    await saveGeneratedScript(makeScript({ templateKey: "pay-focused" }));

    // A driver who completed intake after clicking this script's CTA.
    const [driver] = await db
      .insert(drivers)
      .values({
        firstName: "Vee",
        lastName: "Source",
        email: TEST_EMAIL,
        phone: "555-555-2222",
        homeZip: "75001",
        cdlState: "TX",
        yearsHeld: "3",
        otrYears: "2",
        equipmentRun: ["reefer"],
        desiredEquipment: ["reefer"],
        desiredRegions: ["any"],
        homeTime: ["otr"],
        terminatedFromAnyOfLast3Employers: false,
        failedDotTest: false,
        attestAccurate: true,
        consentToShare: true,
      })
      .returning({ id: drivers.id });

    await db.insert(funnelEvents).values({
      eventType: "intake_completed",
      driverId: driver!.id,
      metadata: { anonymous: false, vsrc: `${SLUG}__pay-focused` },
    });

    const conv = await videoScriptConversions();
    const row = conv.find(
      (c) => c.slug === SLUG && c.templateKey === "pay-focused",
    );
    expect(row).toBeTruthy();
    expect(row!.intakes).toBe(1);
  });

  it("reports zero intakes for a script no one converted on", async () => {
    await saveGeneratedScript(makeScript({ templateKey: "compliance" }));
    const conv = await videoScriptConversions();
    const row = conv.find(
      (c) => c.slug === SLUG && c.templateKey === "compliance",
    );
    expect(row?.intakes).toBe(0);
  });
});

describe("listVideoScripts", () => {
  it("filters by status", async () => {
    const id = await saveGeneratedScript(makeScript({ templateKey: "volume-focused" }));
    await saveGeneratedScript(makeScript({ templateKey: "compliance" }));
    await markVideoScriptStatus(id, "archived");

    const archived = await listVideoScripts({ status: "archived", slug: SLUG });
    expect(archived).toHaveLength(1);
    expect(archived[0].templateKey).toBe("volume-focused");
  });
});
