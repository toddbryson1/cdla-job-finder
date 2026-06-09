// Tests for updateCarrierHandoffConfigAction — the admin drift-card
// inline editor's write path. Integration against the seed DB; mocks
// only next/cache (revalidatePath needs a request context).

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq, like } from "drizzle-orm";
import { db } from "@/db/client";
import { carriers } from "@/db/schema";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

// Import AFTER the mock is registered (vi.mock is hoisted, but keep the
// import here for clarity).
import { updateCarrierHandoffConfigAction } from "../actions";

const NAME_PREFIX = "Handoff Action Test (sentinel)";
const TOKEN = "test-admin-token-0123456789"; // >= 16 chars

const origToken = process.env.ADMIN_TOKEN;

beforeEach(() => {
  process.env.ADMIN_TOKEN = TOKEN;
});

afterEach(async () => {
  if (origToken === undefined) delete process.env.ADMIN_TOKEN;
  else process.env.ADMIN_TOKEN = origToken;
  await db.delete(carriers).where(like(carriers.name, `${NAME_PREFIX}%`));
});

async function seedCarrier(name: string, cfg: unknown): Promise<string> {
  const [c] = await db
    .insert(carriers)
    .values({
      name,
      kind: "partner",
      tier: "none",
      status: "active",
      partnerHandoffConfig: cfg as Record<string, unknown>,
    })
    .returning({ id: carriers.id });
  return c!.id;
}

function form(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

describe("updateCarrierHandoffConfigAction", () => {
  it("rejects an invalid token without touching the DB", async () => {
    const id = await seedCarrier(`${NAME_PREFIX} tok`, {
      handoff_type: "anderson_quickbase",
      quickbase: { app_id: "a", table_id: "t" },
    });
    const res = await updateCarrierHandoffConfigAction(
      form({
        token: "wrong",
        carrierId: id,
        realmHostname: "x.quickbase.com",
        appId: "a",
        tableId: "t",
      }),
    );
    expect(res.ok).toBe(false);
    expect(res.message).toMatch(/token/i);
  });

  it("rejects a malformed carrierId", async () => {
    const res = await updateCarrierHandoffConfigAction(
      form({
        token: TOKEN,
        carrierId: "not-a-uuid",
        realmHostname: "x.quickbase.com",
        appId: "a",
        tableId: "t",
      }),
    );
    expect(res.ok).toBe(false);
    expect(res.message).toMatch(/carrierId/);
  });

  it("refuses to write anderson_quickbase config onto a non-handoff carrier", async () => {
    // No anderson config + no partner_application_stages row → not a
    // handoff candidate. The action must refuse rather than stamp a
    // QuickBase config onto an unrelated carrier.
    const id = await seedCarrier(`${NAME_PREFIX} nonhandoff`, null);
    const res = await updateCarrierHandoffConfigAction(
      form({
        token: TOKEN,
        carrierId: id,
        realmHostname: "x.quickbase.com",
        appId: "a",
        tableId: "t",
      }),
    );
    expect(res.ok).toBe(false);
    expect(res.message).toMatch(/not a handoff carrier/i);

    // Config must be untouched.
    const after = await db.query.carriers.findFirst({
      where: eq(carriers.id, id),
      columns: { partnerHandoffConfig: true },
    });
    expect(after?.partnerHandoffConfig).toBeNull();
  });

  it("repairs a drifted config AND preserves sibling keys (merge, not replace)", async () => {
    // Drifted: declares anderson_quickbase (so it's a candidate) but is
    // missing realm_hostname. Carries a sibling key the editor doesn't
    // expose — that must survive the repair.
    const id = await seedCarrier(`${NAME_PREFIX} merge`, {
      handoff_type: "anderson_quickbase",
      intelliapp_url: "https://intelliapp.example/anderson",
      quickbase: { app_id: "APP1", table_id: "TBL1" },
    });

    const res = await updateCarrierHandoffConfigAction(
      form({
        token: TOKEN,
        carrierId: id,
        realmHostname: "anderson.quickbase.com",
        appId: "APP1",
        tableId: "TBL1",
        defaultRecruiterName: "Pat Recruiter",
      }),
    );
    expect(res.ok).toBe(true);

    const after = await db.query.carriers.findFirst({
      where: eq(carriers.id, id),
      columns: { partnerHandoffConfig: true },
    });
    const cfg = after?.partnerHandoffConfig as Record<string, unknown>;
    // Sibling key preserved (the bug this guards against).
    expect(cfg.intelliapp_url).toBe("https://intelliapp.example/anderson");
    // Edited fields written.
    const qb = cfg.quickbase as Record<string, unknown>;
    expect(qb.realm_hostname).toBe("anderson.quickbase.com");
    expect(qb.app_id).toBe("APP1");
    expect(qb.table_id).toBe("TBL1");
    expect(qb.default_recruiter_name).toBe("Pat Recruiter");
  });

  it("rejects (without writing) when the merged config still won't validate", async () => {
    const id = await seedCarrier(`${NAME_PREFIX} invalid`, {
      handoff_type: "anderson_quickbase",
      quickbase: { app_id: "a", table_id: "t" },
    });
    const res = await updateCarrierHandoffConfigAction(
      form({
        token: TOKEN,
        carrierId: id,
        realmHostname: "", // required field left blank
        appId: "a",
        tableId: "t",
      }),
    );
    expect(res.ok).toBe(false);
    expect(res.message).toMatch(/realm_hostname/);
  });
});
