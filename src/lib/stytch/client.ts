import * as stytch from "stytch";

let cached: stytch.Client | null = null;

export class StytchNotConfiguredError extends Error {
  constructor() {
    super(
      "Stytch is not configured. Set STYTCH_PROJECT_ID and STYTCH_SECRET in .env.local.",
    );
  }
}

export function getStytchClient(): stytch.Client {
  if (cached) return cached;
  const project_id = process.env.STYTCH_PROJECT_ID;
  const secret = process.env.STYTCH_SECRET;
  if (!project_id || !secret) {
    throw new StytchNotConfiguredError();
  }
  cached = new stytch.Client({
    project_id,
    secret,
    env: project_id.startsWith("project-live-")
      ? stytch.envs.live
      : stytch.envs.test,
  });
  return cached;
}

export function isStytchConfigured(): boolean {
  return !!(process.env.STYTCH_PROJECT_ID && process.env.STYTCH_SECRET);
}

export const SESSION_COOKIE = "stytch_session_token";

// Session config per attorney addendum Q10:
// - Magic link expires: 15 minutes (one-time use, enforced by Stytch by default)
// - Idle timeout: 30 minutes — passed on every authenticate() to refresh
// - Absolute timeout: 24 hours — enforced via cookie maxAge below
export const SESSION_IDLE_MINUTES = 30;
export const SESSION_ABSOLUTE_SECONDS = 60 * 60 * 24; // 24h
export const MAGIC_LINK_EXPIRATION_MINUTES = 15;

export function appUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
}
