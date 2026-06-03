// One-shot helper: prints a fresh UNSUBSCRIBE_SECRET + the exact
// Vercel CLI commands to set the two CAN-SPAM env vars on prod.
//
// Run once after tonight's email-compliance work lands:
//   npx tsx scripts/_print-email-env-setup.ts
//
// Copy the printed commands into your terminal (after editing the
// CDLA_SENDER_ADDRESS line to PHTP's actual postal address).
//
// Don't commit the printed secret anywhere — Vercel stores it. Local
// .env.local only needs it if you want to test sending from dev.

import { randomBytes } from "crypto";

const secret = randomBytes(32).toString("base64");

const cmds = [
  "# 1. UNSUBSCRIBE_SECRET — HMAC key for unsubscribe tokens.",
  "#    Long-lived. Rotating it invalidates every outstanding",
  "#    unsubscribe link in already-sent emails, so set it once",
  "#    and leave it.",
  `echo '${secret}' | npx vercel env add UNSUBSCRIBE_SECRET production`,
  "",
  "# 2. CDLA_SENDER_ADDRESS — PHTP's physical postal address.",
  "#    Required by CAN-SPAM § 7704(a)(5)(A)(iii). Format the way",
  "#    you want it to appear in the email footer. Edit this line",
  "#    before running it.",
  `echo 'PHTP · 1715 Aaron Brenner Dr, Memphis, TN 38120' | npx vercel env add CDLA_SENDER_ADDRESS production`,
  "",
  "# 3. Trigger a fresh Vercel deploy so the new env vars take effect",
  "#    (Vercel only re-reads env on deploy):",
  "npx vercel --prod",
  "",
  "# 4. Verify by sending a test by triggering /api/cron/daily once",
  "#    the deploy lands (uses CRON_SECRET):",
  "#",
  "#    source /tmp/cdla-prod-env",
  "#    curl -sH \"Authorization: Bearer $CRON_SECRET\" \\",
  '#         "https://www.cdla.jobs/api/cron/daily" | jq',
  "#",
  "#    Look for { applicationNudges: { ok: true, sent: N, ... } } in",
  "#    the response.  If sent > 0 a real email went to a real driver,",
  "#    so test in staging first if you have one.",
];

console.log("");
console.log(cmds.join("\n"));
console.log("");
