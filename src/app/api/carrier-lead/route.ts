import { NextResponse } from "next/server";
import { z } from "zod";
import {
  GhlError,
  isGhlConfigured,
  sendEmail,
  upsertContact,
} from "@/lib/ghl/client";
import { carrierBriefEmail } from "@/lib/ghl/carrierBriefEmail";

export const runtime = "nodejs";

// TODO: rate-limit this endpoint (per IP + per email) before launch.

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
    console.warn("[carrier-lead] honeypot triggered for", lead.email);
    return NextResponse.json({ ok: true });
  }

  // Direct GHL API path is the primary; the inbound webhook is kept as a
  // fallback in case the token is unset or the API call fails after the
  // upsert succeeds.
  if (isGhlConfigured()) {
    try {
      await sendViaGhlApi(lead);
      console.log(
        `[carrier-lead] ${lead.fullName} <${lead.email}> @ ${lead.carrierName} (fleet ${lead.fleetSize}) sent via GHL API`,
      );
      return NextResponse.json({ ok: true, email: lead.email });
    } catch (err) {
      const stage =
        err instanceof GhlError ? err.message : String(err);
      console.error("[carrier-lead] GHL API path failed:", stage, err);
      // Fall through to webhook fallback below.
    }
  }

  // Fallback: forward to the GHL inbound webhook so the workflow handles it.
  const webhookUrl = process.env.GHL_CARRIER_LEAD_WEBHOOK_URL;
  if (!webhookUrl) {
    console.error(
      "[carrier-lead] both GHL API and webhook are unconfigured / failed",
    );
    return NextResponse.json(
      {
        error:
          "We could not send your request right now. Try again, or email sales@cdla.jobs.",
      },
      { status: 502 },
    );
  }

  const payload = {
    source: "cdla.jobs /partners/brief",
    submittedAt: new Date().toISOString(),
    fullName: lead.fullName,
    firstName: firstNameOf(lead.fullName),
    lastName: lastNameOf(lead.fullName),
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
        "[carrier-lead] GHL webhook fallback non-2xx:",
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
    console.error("[carrier-lead] GHL webhook fallback fetch failed:", err);
    return NextResponse.json(
      {
        error:
          "We could not send your request right now. Try again, or email sales@cdla.jobs.",
      },
      { status: 502 },
    );
  }

  return NextResponse.json({ ok: true, email: lead.email });
}

async function sendViaGhlApi(
  lead: z.infer<typeof carrierLeadSchema>,
): Promise<void> {
  const briefPdfUrl = process.env.GHL_BRIEF_PDF_URL;
  const upsert = await upsertContact({
    email: lead.email,
    firstName: firstNameOf(lead.fullName),
    lastName: lastNameOf(lead.fullName),
    phone: lead.phone,
    companyName: lead.carrierName,
    source: "cdla.jobs /partners/brief",
    tags: ["carrier-brief-requested", `fleet-${lead.fleetSize}`],
  });

  const { subject, html } = carrierBriefEmail({
    firstName: firstNameOf(lead.fullName),
    carrierName: lead.carrierName,
    hasAttachment: Boolean(briefPdfUrl),
    fallbackPdfUrl: briefPdfUrl,
  });

  await sendEmail({
    contactId: upsert.contactId,
    subject,
    html,
    attachments: briefPdfUrl ? [briefPdfUrl] : undefined,
  });
}

function firstNameOf(full: string): string {
  return full.trim().split(/\s+/)[0] ?? full.trim();
}

function lastNameOf(full: string): string {
  const parts = full.trim().split(/\s+/);
  return parts.slice(1).join(" ");
}
