// Single-user login: one passphrase (APP_PASSWORD) and a signed session cookie.
// Uses Web Crypto only, so it runs in middleware, server actions and tests alike.

export const SESSION_COOKIE = "trailmate_session";
/** Stay logged in for 90 days on a device (it's a personal travel app). */
export const SESSION_MAX_AGE_S = 90 * 24 * 60 * 60;

/**
 * Paths that work without logging in: the login page, the files the browser
 * and the service worker need before any page loads, the static offline
 * fallback (no data in it), and the cron endpoint, which has its own
 * CRON_SECRET check.
 */
const PUBLIC_EXACT = new Set([
  "/login",
  "/offline",
  "/manifest.webmanifest",
  "/sw.js",
  "/pdf.worker.min.mjs",
  "/favicon.ico",
  "/icon.svg",
  "/icon-192.png",
  "/icon-512.png",
  "/badge-96.png",
  "/api/cron/sweep",
]);

export function isPublicPath(pathname: string): boolean {
  return PUBLIC_EXACT.has(pathname) || pathname.startsWith("/_next/static/");
}

/** Where to go after logging in: only a path on this site, never "//evil.com". */
export function safeNext(next: string | null | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return "/";
  if (next === "/login" || next.startsWith("/login?")) return "/";
  return next;
}

/** The HMAC key: APP_SECRET if set, else derived from the password (changing it logs every device out). */
export function sessionSecret(env: Record<string, string | undefined> = process.env): string | null {
  if (!env.APP_PASSWORD) return null;
  return env.APP_SECRET || `trailmate-session:${env.APP_PASSWORD}`;
}

const encoder = new TextEncoder();

async function hmac(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(data));
  let bin = "";
  for (const b of new Uint8Array(sig)) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Compare without leaking how many leading characters match. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Cookie value: "v1.<issued-at ms>.<HMAC of the first two parts>". */
export async function signSession(secret: string, now = Date.now()): Promise<string> {
  const payload = `v1.${now}`;
  return `${payload}.${await hmac(secret, payload)}`;
}

export async function verifySession(token: string | undefined, secret: string, now = Date.now()): Promise<boolean> {
  if (!token) return false;
  const m = /^(v1\.(\d{1,15}))\.([A-Za-z0-9_-]+)$/.exec(token);
  if (!m) return false;
  const issuedAt = Number(m[2]);
  // A little slack for clock changes, but nothing from the future beyond that.
  if (issuedAt > now + 60_000 || now - issuedAt > SESSION_MAX_AGE_S * 1000) return false;
  return timingSafeEqual(m[3], await hmac(secret, m[1]));
}

/** Check the passphrase in constant time (both sides hashed to the same length first). */
export async function passwordMatches(input: string, expected: string): Promise<boolean> {
  const salt = "trailmate-password-check";
  return timingSafeEqual(await hmac(salt, input), await hmac(salt, expected));
}
