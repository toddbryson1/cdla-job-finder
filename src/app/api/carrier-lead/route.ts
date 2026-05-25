import { NextResponse } from "next/server";
import { z } from "zod";

export const runtime = "nodejs";

// TODO: rate-limit this endpoint (per IP + per email) before launch. For
// now we rely on the form being one-page and the gated PDF being uploaded
// inside GHL — a malicious actor sees the brief by submitting once.

const FLEET_SIZE_VALUES = ["1-10", "11-50", "51-250", "250+"] as const;

const carrierLeadSchema = z.object({
  fullName: z.string().trim().min(1, "Your name is required").max(120),
  carrierName: z
    .string()
    .trim()
    .min(1, "Carrier or company name is required")
    .max(160),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email("That doesn't look like an email"),
  phone: z
    .string()
    .trim()
    .max(40)
    .optional()
    .transform((v) => (v && v.length > 0 ? v : undefined)),
  fleetSize: z.enum(FLEET_SIZE_VALUES),
  // Honeypot — bots tend to fill every visible-looking input.
  // We reject any submission that puts a value in here.
  website: z.string().max(0).optional(),
});

export async function POST(request: Request) {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = carrierLeadSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Validation failed",
        issues: parsed.error.issues.map((i) => ({
          path: i.path,
          message: i.message,
        })),
      },
      { status: 400 },
    );
  }

  const lead = parsed.data;
  if (lead.website) {
    // Honeypot trip — respond OK so the bot doesn't learn anything, but
    // don't actually forward to GHL.
    console.warn("[carrier-lead] honeypot triggered for", lead.email);
    return NextResponse.json({ ok: true });
  }

  const webhookUrl = process.env.GHL_CARRIER_LEAD_WEBHOOK_URL;
  if (!webhookUrl) {
    console.error("[carrier-lead] GHL_CARRIER_LEAD_WEBHOOK_URL is not set");
    return NextResponse.json(
      { error: "Lead capture is not configured on the server." },
      { status: 500 },
    );
  }

  // Forward to the GHL inbound webhook. GHL maps the JSON keys to contact
  // fields inside the workflow trigger config — keep the keys stable and
  // descriptive so the GHL workflow can reference them without surprises.
  const payload = {
    source: "cdla.jobs /partners/brief",
    submittedAt: new Date().toISOString(),
    fullName: lead.fullName,
    firstName: lead.fullName.split(/\s+/)[0] ?? lead.fullName,
    lastName: lead.fullName.split(/\s+/).slice(1).join(" "),
    carrierName: lead.carrierName,
    email: lead.email,
    phone: lead.phone,
    fleetSize: lead.fleetSize,
    tag: "carrier-brief-requested",
  };

  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error(
        "[carrier-lead] GHL webhook returned non-2xx:",
        res.status,
        body.slice(0, 500),
      );
      return NextResponse.json(
        {
          error:
            "We could not send your request right now. Try again, or email sales@cdla.jobs.",
        },
        { status: 502 },
      );
    }
  } catch (err) {
    console.error("[carrier-lead] GHL webhook fetch failed:", err);
    return NextResponse.json(
      {
        error:
          "We could not send your request right now. Try again, or email sales@cdla.jobs.",
      },
      { status: 502 },
    );
  }

  console.log(
    `[carrier-lead] ${lead.fullName} <${lead.email}> @ ${lead.carrierName} (fleet ${lead.fleetSize}) forwarded to GHL`,
  );

  return NextResponse.json({ ok: true, email: lead.email });
}
