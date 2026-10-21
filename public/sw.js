// Trailmate service worker.
//  - Push notifications (step 4)
//  - Offline reading (step 6):
//      app files (/_next/static, icons)  cache first   (they never change)
//      documents (/api/documents/*/file) cache first   (a file never changes)
//      pages                             network first, 4 s, then the saved copy
//  - "Save this trip": the page sends a list of URLs; we fetch and keep them,
//    plus the scripts/styles each page needs.
// In development (sw.js?mode=dev) only push is active, so you never see stale code.

const VERSION = "v3"; // bump to drop old caches
const STATIC = `trailmate-static-${VERSION}`;
const PAGES = `trailmate-pages-${VERSION}`;
const DOCS = `trailmate-docs-${VERSION}`;
const DEV = new URL(self.location.href).searchParams.get("mode") === "dev";
const NETWORK_TIMEOUT_MS = 4000;

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      if (!DEV) {
        const cache = await caches.open(PAGES);
        await cache.addAll(["/offline"]).catch(() => {});
        // The PDF renderer, so documents open offline even if none was viewed yet.
        await (await caches.open(STATIC)).addAll(["/pdf.worker.min.mjs"]).catch(() => {});
      }
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keep = new Set([STATIC, PAGES, DOCS]);
      for (const key of await caches.keys()) if (key.startsWith("trailmate-") && !keep.has(key)) await caches.delete(key);
      await self.clients.claim();
    })(),
  );
});

/** Cache key for a page: same URL without the one-off "saved" highlight param. */
function pageKey(url) {
  const u = new URL(url, self.location.origin);
  u.searchParams.delete("saved");
  u.hash = "";
  return u.toString();
}

async function cacheFirst(cacheName, request) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request, { ignoreVary: true });
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok) cache.put(request, res.clone());
  return res;
}

/**
 * Only a real page is worth saving: 200 HTML, not a redirect and not the login
 * page. Otherwise a logged-out visit would overwrite a trip saved for offline.
 */
function isSavablePage(res) {
  if (!res.ok || res.status !== 200 || res.redirected) return false;
  if (!(res.headers.get("content-type") || "").includes("text/html")) return false;
  return !res.url || new URL(res.url).pathname !== "/login";
}

async function networkFirstPage(request) {
  const cache = await caches.open(PAGES);
  const key = pageKey(request.url);
  try {
    const res = await Promise.race([
      fetch(request),
      new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), NETWORK_TIMEOUT_MS)),
    ]);
    if (isSavablePage(res)) cache.put(key, res.clone());
    return res;
  } catch {
    return (await cache.match(key, { ignoreVary: true })) || (await cache.match("/offline")) || Response.error();
  }
}

self.addEventListener("fetch", (event) => {
  if (DEV) return;
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith("/_next/static/") || /\.(png|svg|ico|webmanifest|mjs)$/.test(url.pathname)) {
    event.respondWith(cacheFirst(STATIC, req));
  } else if (/^\/api\/documents\/[^/]+\/file$/.test(url.pathname)) {
    event.respondWith(cacheFirst(DOCS, req));
  } else if (url.pathname.startsWith("/api/")) {
    return; // live data: network only
  } else if (req.headers.get("RSC") === "1") {
    // In-app navigation data. If it fails, Next falls back to a full page
    // load, which the branch below can answer from the saved copy.
    event.respondWith(fetch(req).catch(() => Response.error()));
  } else if (req.mode === "navigate") {
    event.respondWith(networkFirstPage(req));
  }
});

// ------------------------------------------------------------ save a trip

async function savePage(url) {
  const res = await fetch(url, { credentials: "same-origin", headers: { accept: "text/html" } });
  if (!isSavablePage(res)) return false;
  const html = await res.clone().text();
  await (await caches.open(PAGES)).put(pageKey(url), res);
  // Keep the scripts and styles this page needs, so it works on its own.
  const assets = new Set(html.match(/\/_next\/static\/[^"'\s)\\]+/g) || []);
  const statics = await caches.open(STATIC);
  await Promise.all([...assets].map(async (a) => {
    if (!(await statics.match(a))) await statics.add(a).catch(() => {});
  }));
  return true;
}

async function saveDoc(url) {
  const cache = await caches.open(DOCS);
  if (await cache.match(url)) return true;
  try {
    await cache.add(url);
    return true;
  } catch {
    return false;
  }
}

self.addEventListener("message", (event) => {
  const msg = event.data || {};
  if (msg.type !== "SAVE_TRIP" || DEV) return;
  event.waitUntil(
    (async () => {
      let pages = 0;
      let docs = 0;
      for (const url of msg.pages || []) if (await savePage(url).catch(() => false)) pages++;
      for (const url of msg.docs || []) if (await saveDoc(url)) docs++;
      // Scripts the page loaded on demand (e.g. the PDF viewer), which no HTML lists.
      const statics = await caches.open(STATIC);
      for (const url of msg.assets || []) {
        if (new URL(url).origin === self.location.origin && !(await statics.match(url))) await statics.add(url).catch(() => {});
      }
      const reply = { type: "TRIP_SAVED", tripId: msg.tripId, pages, docs, at: Date.now() };
      if (event.ports && event.ports[0]) event.ports[0].postMessage(reply);
    })(),
  );
});

// ------------------------------------------------------------ push (step 4)

self.addEventListener("push", (event) => {
  let data;
  try {
    data = event.data.json();
  } catch {
    data = { title: "Trailmate", body: event.data ? event.data.text() : "" };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || "Trailmate", {
      body: data.body || "",
      // Same tag = replace the old notification (e.g. a corrected "leave now").
      tag: data.tag,
      renotify: Boolean(data.tag),
      icon: "/icon-192.png",
      badge: "/badge-96.png",
      data: { url: data.url || "/" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || "/", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      for (const w of windows) {
        if ("focus" in w) {
          w.navigate(url);
          return w.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
