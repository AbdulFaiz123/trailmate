"use client";

import { useEffect } from "react";

/**
 * After saving, the server redirects to /trips/:id?saved=leg-123.
 * (A #hash would be dropped by the redirect.) Scroll that item into view and
 * flash it so the traveler sees what changed.
 */
export function ScrollToSaved({ target }: { target?: string }) {
  useEffect(() => {
    if (!target) return;
    const el = document.getElementById(target);
    if (!el) return;
    el.scrollIntoView({ block: "center" });
    el.classList.add("saved-flash");
    // Clean the URL so a reload doesn't scroll again.
    window.history.replaceState(null, "", window.location.pathname);
  }, [target]);
  return null;
}
