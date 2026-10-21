// Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import {
  isPublicPath, passwordMatches, safeNext, SESSION_COOKIE, SESSION_MAX_AGE_S, sessionSecret, signSession, verifySession,
} from "../src/lib/auth";
import { middleware } from "../src/middleware";

const SECRET = "test-secret";

test("a signed session verifies; a tampered, foreign or expired one doesn't", async () => {
  const now = Date.UTC(2026, 9, 21, 12);
  const token = await signSession(SECRET, now);
  assert.equal(await verifySession(token, SECRET, now), true);
  assert.equal(await verifySession(token, SECRET, now + (SESSION_MAX_AGE_S - 60) * 1000), true);

  assert.equal(await verifySession(token, "other-secret", now), false, "signed with another key");
  assert.equal(await verifySession(token.replace(String(now), String(now + 1)), SECRET, now), false, "issued-at changed");
  assert.equal(await verifySession(token.slice(0, -2) + (token.endsWith("A") ? "BB" : "AA"), SECRET, now), false, "signature changed");
  assert.equal(await verifySession(token, SECRET, now + (SESSION_MAX_AGE_S + 60) * 1000), false, "expired");
  assert.equal(await verifySession(await signSession(SECRET, now + 3_600_000), SECRET, now), false, "from the future");
  for (const junk of [undefined, "", "v1", "v1.123", "v2.123.abc", `${token}.extra`]) {
    assert.equal(await verifySession(junk, SECRET, now), false, `junk: ${junk}`);
  }
});

test("passphrase check", async () => {
  assert.equal(await passwordMatches("correct horse", "correct horse"), true);
  assert.equal(await passwordMatches("correct hors", "correct horse"), false);
  assert.equal(await passwordMatches("", "correct horse"), false);
});

test("session secret: APP_SECRET wins, else derived from the password, none without a password", () => {
  assert.equal(sessionSecret({}), null);
  assert.equal(sessionSecret({ APP_SECRET: "s" }), null, "a secret alone doesn't turn login on");
  assert.equal(sessionSecret({ APP_PASSWORD: "p", APP_SECRET: "s" }), "s");
  assert.notEqual(sessionSecret({ APP_PASSWORD: "p" }), sessionSecret({ APP_PASSWORD: "q" }));
});

test("after login, only go to a path on this site", () => {
  assert.equal(safeNext("/trips/abc?tab=lists"), "/trips/abc?tab=lists");
  for (const bad of [null, undefined, "", "https://evil.com", "//evil.com", "/\\evil.com", "javascript:alert(1)", "/login", "/login?next=/"]) {
    assert.equal(safeNext(bad), "/", String(bad));
  }
});

test("allow-list: only login, static files and the cron endpoint are public", () => {
  for (const p of ["/login", "/offline", "/_next/static/chunks/main.js", "/manifest.webmanifest", "/sw.js", "/pdf.worker.min.mjs", "/icon-192.png", "/icon.svg", "/badge-96.png", "/api/cron/sweep"]) {
    assert.equal(isPublicPath(p), true, p);
  }
  for (const p of ["/", "/settings", "/trips/abc", "/alerts", "/api/documents/x/file", "/api/import", "/api/sync", "/api/push/subscribe", "/api/push/test", "/api/alerts", "/api/cron/sweep/x", "/login/x", "/sw.js.map", "/_next/data/x.json"]) {
    assert.equal(isPublicPath(p), false, p);
  }
});

// ------------------------------------------------------------ middleware

async function withEnv<T>(env: Record<string, string | undefined>, fn: () => Promise<T>): Promise<T> {
  const saved = Object.fromEntries(Object.keys(env).map((k) => [k, process.env[k]]));
  const set = (vars: Record<string, string | undefined>) => {
    for (const [k, v] of Object.entries(vars)) {
      if (v === undefined) delete (process.env as Record<string, string | undefined>)[k];
      else (process.env as Record<string, string | undefined>)[k] = v;
    }
  };
  set(env);
  try {
    return await fn();
  } finally {
    set(saved);
  }
}

function request(path: string, init: { cookie?: string; method?: string; headers?: Record<string, string> } = {}) {
  const headers = new Headers(init.headers);
  if (init.cookie) headers.set("cookie", `${SESSION_COOKIE}=${init.cookie}`);
  return new NextRequest(new URL(path, "http://localhost:3000"), { method: init.method ?? "GET", headers });
}

const passes = (res: Response) => res.headers.get("x-middleware-next") === "1";

test("middleware: logged out, pages go to /login and data gets 401", async () => {
  await withEnv({ APP_PASSWORD: "pw", APP_SECRET: SECRET }, async () => {
    const page = await middleware(request("/trips/abc?tab=lists"));
    assert.equal(page.status, 307);
    const to = new URL(page.headers.get("location")!);
    assert.equal(to.pathname, "/login");
    assert.equal(to.searchParams.get("next"), "/trips/abc?tab=lists");

    assert.equal(new URL((await middleware(request("/"))).headers.get("location")!).search, "", "no ?next for the home page");

    for (const p of ["/api/documents/x/file", "/api/import", "/api/sync", "/api/push/subscribe"]) {
      assert.equal((await middleware(request(p))).status, 401, p);
    }
    assert.equal((await middleware(request("/settings", { method: "POST", headers: { "next-action": "abc" } }))).status, 401, "server action");
    assert.equal((await middleware(request("/trips/abc", { headers: { RSC: "1" } }))).status, 401, "in-app navigation data");
    assert.equal((await middleware(request("/", { cookie: await signSession("wrong") }))).status, 307, "cookie signed with another key");

    for (const p of ["/login", "/sw.js", "/manifest.webmanifest", "/icon-192.png", "/pdf.worker.min.mjs", "/_next/static/x.js"]) {
      assert.ok(passes(await middleware(request(p))), p);
    }
    assert.ok(passes(await middleware(request("/api/cron/sweep", { method: "POST" }))), "cron keeps its own CRON_SECRET check");
  });
});

test("middleware: logged in, everything passes", async () => {
  await withEnv({ APP_PASSWORD: "pw", APP_SECRET: SECRET }, async () => {
    const cookie = await signSession(SECRET);
    for (const p of ["/", "/trips/abc", "/settings", "/api/documents/x/file", "/api/import"]) {
      assert.ok(passes(await middleware(request(p, { cookie }))), p);
    }
  });
});

test("middleware: without APP_PASSWORD, open in development, locked in production", async () => {
  await withEnv({ APP_PASSWORD: undefined, NODE_ENV: "development" }, async () => {
    assert.ok(passes(await middleware(request("/trips/abc"))));
    assert.ok(passes(await middleware(request("/api/import"))));
  });
  await withEnv({ APP_PASSWORD: undefined, NODE_ENV: "production" }, async () => {
    const page = await middleware(request("/trips/abc"));
    assert.equal(page.status, 503);
    assert.match(await page.text(), /APP_PASSWORD/);
    assert.equal((await middleware(request("/api/documents/x/file"))).status, 503);
    assert.ok(passes(await middleware(request("/sw.js"))), "static files still load");
  });
});
