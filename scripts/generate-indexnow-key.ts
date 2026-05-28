// One-shot helper: generate an IndexNow key and print the env-var line
// to copy into .env.local + Vercel project settings.
//
// Usage:  npm run gen:indexnow-key
//
// The key is 32 hex chars (128 bits). IndexNow recommends 8–128 chars
// of [a-z0-9-]. After setting INDEXNOW_KEY in env, the public
// verification file is served at https://cdla.jobs/<KEY>.txt by
// src/app/[indexnowKey]/route.ts — no other deploy step required.

import { randomBytes } from "node:crypto";

const key = randomBytes(16).toString("hex");
process.stdout.write(`INDEXNOW_KEY=${key}\n`);
