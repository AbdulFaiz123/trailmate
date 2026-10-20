"use client";

import { useEffect } from "react";

/** Register /sw.js once the page has loaded. */
export function ServiceWorker() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch((e) => console.warn("Service worker failed", e));
  }, []);
  return null;
}
