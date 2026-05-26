// Thin wrapper around the GoHighLevel REST API (services.leadconnectorhq.com).
// All calls go through fetch; auth via the Private Integration token stored
// in GHL_API_TOKEN. Each function returns structured errors so callers can
// log specifics without leaking the token.

const BASE_URL = "https://services.leadconnectorhq.com";
const API_VERSION = "2021-07-28";

export class GhlNotConfiguredError extends Error {
  constructor(missing: string[]) {
    super(`GHL is not fully configured. Missing env vars: ${missing.join(", ")}`);
  }
}

export interface GhlConfig {
  token: string;
  locationId: string;
}

export function getGhlConfig(): GhlConfig {
  const token = process.env.GHL_API_TOKEN;
  const locationId = process.env.GHL_LOCATION_ID;
  const missing: string[] = [];
  if (!token) missing.push("GHL_API_TOKEN");
  if (!locationId) missing.push("GHL_LOCATION_ID");
  if (missing.length > 0) throw new GhlNotConfiguredError(missing);
  return { token: token!, locationId: locationId! };
}

export function isGhlConfigured(): boolean {
  return !!(process.env.GHL_API_TOKEN && process.env.GHL_LOCATION_ID);
}

interface GhlFetchOptions {
  method: "GET" | "POST" | "PUT" | "DELETE";
  path: string;
  body?: unknown;
  cfg?: GhlConfig;
}

async function ghlFetch<T>({ method, path, body, cfg }: GhlFetchOptions): Promise<T> {
  const conf = cfg ?? getGhlConfig();
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${conf.token}`,
      Version: API_VERSION,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: body == null ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    // GHL occasionally returns non-JSON error bodies.
  }
  if (!res.ok) {
    const err = json as { message?: string; error?: string } | null;
    const message =
      err?.message ?? err?.error ?? `GHL ${method} ${path} ${res.status}`;
    throw new GhlError(message, res.status, json);
  }
  return json as T;
}

export class GhlError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public payload: unknown,
  ) {
    super(message);
  }
}

// --- Contacts -----------------------------------------------------------

export interface UpsertContactInput {
  email: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  companyName?: string;
  source?: string;
  tags?: string[];
  /** City — used by nurture email templates (e.g., "Denver"). */
  city?: string;
  /** Full state name — preferred for templates ("Colorado" not "CO"). */
  state?: string;
  postalCode?: string;
}

export interface UpsertContactResult {
  contactId: string;
  isNew: boolean;
}

interface UpsertContactResponse {
  new?: boolean;
  contact?: { id?: string };
}

export async function upsertContact(
  input: UpsertContactInput,
  cfg?: GhlConfig,
): Promise<UpsertContactResult> {
  const conf = cfg ?? getGhlConfig();
  const res = await ghlFetch<UpsertContactResponse>({
    method: "POST",
    path: "/contacts/upsert",
    body: {
      locationId: conf.locationId,
      email: input.email,
      firstName: input.firstName,
      lastName: input.lastName,
      phone: input.phone,
      companyName: input.companyName,
      source: input.source,
      tags: input.tags,
      city: input.city,
      state: input.state,
      postalCode: input.postalCode,
    },
    cfg: conf,
  });
  const contactId = res.contact?.id;
  if (!contactId) {
    throw new GhlError("upsertContact returned no contact id", 200, res);
  }
  return { contactId, isNew: res.new === true };
}

// --- Emails -------------------------------------------------------------
// GHL's "send email" path goes through the conversations/messages endpoint
// with type=Email. attachments accept an array of public URLs that GHL
// fetches and attaches to the outgoing message.

export interface SendEmailInput {
  contactId: string;
  subject: string;
  html: string;
  attachments?: string[];
  emailFrom?: string;
}

export interface SendEmailResult {
  messageId?: string;
  emailMessageId?: string;
}

export async function sendEmail(
  input: SendEmailInput,
  cfg?: GhlConfig,
): Promise<SendEmailResult> {
  return ghlFetch<SendEmailResult>({
    method: "POST",
    path: "/conversations/messages",
    body: {
      type: "Email",
      contactId: input.contactId,
      subject: input.subject,
      html: input.html,
      attachments: input.attachments && input.attachments.length > 0
        ? input.attachments
        : undefined,
      emailFrom: input.emailFrom,
    },
    cfg,
  });
}
