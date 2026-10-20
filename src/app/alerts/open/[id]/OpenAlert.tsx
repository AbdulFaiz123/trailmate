"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { markAlertRead } from "@/app/alert-actions";

export function OpenAlert({ id, title, url }: { id: string; title: string; url: string }) {
  const router = useRouter();
  useEffect(() => {
    // Only same-site paths: never redirect to an address stored by mistake.
    const target = url.startsWith("/") && !url.startsWith("//") ? url : "/alerts";
    markAlertRead(id)
      .catch(() => {}) // offline: still show the item; it stays unread
      .finally(() => {
        window.dispatchEvent(new Event("trailmate:alerts-changed"));
        router.replace(target);
      });
  }, [id, url, router]);
  return <p className="py-10 text-center text-sm text-muted">Opening “{title}”…</p>;
}
