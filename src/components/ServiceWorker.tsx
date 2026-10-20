"use client";

import { useEffect } from "react";

/** Register /sw.js. In development it only handles push (no page caching). */
export function ServiceWorker() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const url = process.env.NODE_ENV === "development" ? "/sw.js?mode=dev" : "/sw.js";
    navigator.serviceWorker.register(url).catch((e) => console.warn("Service worker failed", e));
  }, []);
  return null;
}
