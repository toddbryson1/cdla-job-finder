// Daily report email for the content machine, sent via Resend per the
// owner's choice in spec discovery. Spec §6 defines the subject + body
// shape exactly; this module is a straight translation of that, plus
// the separate "RUN FAILED" envelope for hard run-level failures.
//
// Required env:
//   RESEND_API_KEY                  — Resend API key (resend.com → API Keys)
//   CONTENT_MACHINE_REPORT_EMAIL    — recipient (default: jabridgeco@gmail.com)
// Optional env:
//   CONTENT_MACHINE_REPORT_FROM     — sender (default: noreply@cdla.jobs;
//                                     requires verified domain in Resend.
//                                     Set to onboarding@resend.dev for
//                                     local testing before the domain is
//                                     verified.)

import { Resend } from "resend";
import type { DailyIndexSummary } from "./gsc";

export const DEFAULT_RECIPIENT = "jabridgeco@gmail.com";
export const DEFAULT_FROM = "CDLA.jobs <noreply@cdla.jobs>";

export type RunStatus = "SUCCESS" | "PARTIAL" | "FAILED" | "DISABLED";

const BUCKET_NAMES: Record<number, string> = {
  1: "Pay & Money",
  2: "Career Strategy",
  3: "Life on the Road",
  4: "How the Job-Search System Works",
};

export interface PublishedRow {
  title: string;
  publishedUrl: string;
  bucket: number;
  wordCount: number;
  reviewFlags: string;
}

export interface FailedRow {
  title: string;
  bucket: number;
  reason: string;
}

export interface ReportInput {
  dateYmd: string; // YYYY-MM-DD
  dailyCount: number;
  status: RunStatus;
  published: PublishedRow[];
  failed: FailedRow[];
  gsc: DailyIndexSummary;
  killSwitchEnabled: boolean;
}

export function buildReportSubject(input: ReportInput): string {
  return `CDLA.jobs daily content report — ${input.dateYmd} — ${input.published.length} published, ${input.failed.length} failed`;
}

export function buildReportBody(input: ReportInput): string {
  const lines: string[] = [];
  lines.push(`Date: ${input.dateYmd}`);
  lines.push(`Daily count config: ${input.dailyCount}`);
  lines.push(`Status: ${input.status}`);
  lines.push("");

  lines.push(`PUBLISHED (${input.published.length}):`);
  if (input.published.length === 0) {
    lines.push("  (none)");
  } else {
    for (const p of input.published) {
      lines.push("");
      lines.push(` - ${p.title}`);
      lines.push(`   URL: ${p.publishedUrl}`);
      lines.push(
        `   Bucket: ${p.bucket} — ${BUCKET_NAMES[p.bucket] ?? "(unknown)"}`,
      );
      lines.push(`   Word count: ${p.wordCount}`);
      lines.push(
        `   Review flags: ${p.reviewFlags?.trim() ? p.reviewFlags.trim() : "none"}`,
      );
    }
  }

  lines.push("");
  lines.push(`FAILED (${input.failed.length}):`);
  if (input.failed.length === 0) {
    lines.push("  (none)");
  } else {
    for (const f of input.failed) {
      lines.push("");
      lines.push(` - ${f.title || "untitled"}`);
      lines.push(`   Bucket: ${f.bucket}`);
      lines.push(`   Reason: ${f.reason}`);
    }
  }

  lines.push("");
  lines.push(
    `GSC index status: ${
      input.gsc.configured
        ? `${input.gsc.pendingAt3DaysOrMore} pending at 3+ days, ${input.gsc.pendingAt7DaysOrMore} pending at 7+ days`
        : "not configured"
    }`,
  );
  lines.push(
    `Machine kill switch: ${input.killSwitchEnabled ? "enabled" : "disabled"}`,
  );

  return lines.join("\n");
}

export interface FailureEmailInput {
  dateYmd: string;
  error: Error | string;
  stack?: string;
}

export function buildFailureSubject(input: FailureEmailInput): string {
  return `CDLA.jobs content machine — RUN FAILED — ${input.dateYmd}`;
}

export function buildFailureBody(input: FailureEmailInput): string {
  const errText =
    input.error instanceof Error ? input.error.message : String(input.error);
  const stack =
    input.stack ??
    (input.error instanceof Error ? input.error.stack ?? "" : "");
  return [
    `Date: ${input.dateYmd}`,
    `Status: FAILED — the daily run threw before the report could be sent.`,
    "",
    `Error: ${errText}`,
    "",
    stack ? `Stack:\n${stack}` : "(no stack available)",
  ].join("\n");
}

export interface SendResult {
  ok: boolean;
  id?: string;
  error?: string;
}

function resendOrNull(): Resend | null {
  const key = process.env.RESEND_API_KEY?.trim();
  if (!key) return null;
  return new Resend(key);
}

function recipient(): string {
  return (
    process.env.CONTENT_MACHINE_REPORT_EMAIL?.trim() || DEFAULT_RECIPIENT
  );
}

function sender(): string {
  return process.env.CONTENT_MACHINE_REPORT_FROM?.trim() || DEFAULT_FROM;
}

export async function sendDailyReport(input: ReportInput): Promise<SendResult> {
  const resend = resendOrNull();
  if (!resend) {
    return { ok: false, error: "RESEND_API_KEY is not set" };
  }
  try {
    const res = await resend.emails.send({
      from: sender(),
      to: recipient(),
      subject: buildReportSubject(input),
      text: buildReportBody(input),
    });
    if (res.error) {
      return { ok: false, error: res.error.message };
    }
    return { ok: true, id: res.data?.id };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function sendFailureEmail(
  input: FailureEmailInput,
): Promise<SendResult> {
  const resend = resendOrNull();
  if (!resend) {
    return { ok: false, error: "RESEND_API_KEY is not set" };
  }
  try {
    const res = await resend.emails.send({
      from: sender(),
      to: recipient(),
      subject: buildFailureSubject(input),
      text: buildFailureBody(input),
    });
    if (res.error) {
      return { ok: false, error: res.error.message };
    }
    return { ok: true, id: res.data?.id };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
