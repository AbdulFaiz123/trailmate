"use client";

import { useEffect, useState } from "react";

type Status = "checking" | "unsupported" | "no-keys" | "blocked" | "off" | "on";

function urlBase64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

/** Turn push notifications on/off for this device, and send a test. */
export function PushControls({ publicKey }: { publicKey: string }) {
  const [status, setStatus] = useState<Status>("checking");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || typeof Notification === "undefined") return setStatus("unsupported");
      if (!publicKey) return setStatus("no-keys");
      if (Notification.permission === "denied") return setStatus("blocked");
      const reg = await navigator.serviceWorker.ready;
      setStatus((await reg.pushManager.getSubscription()) ? "on" : "off");
    })().catch(() => setStatus("unsupported"));
  }, [publicKey]);

  async function enable() {
    setBusy(true);
    setMessage("");
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setStatus(permission === "denied" ? "blocked" : "off");
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey) });
      const res = await fetch("/api/push/subscribe", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(sub) });
      if (!res.ok) throw new Error("Server didn't save the subscription");
      setStatus("on");
    } catch (e) {
      setMessage(`Couldn't turn on notifications: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/push/subscribe", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ endpoint: sub.endpoint }) });
        await sub.unsubscribe();
      }
      setStatus("off");
    } finally {
      setBusy(false);
    }
  }

  async function test() {
    setBusy(true);
    setMessage("");
    try {
      const res = await fetch("/api/push/test", { method: "POST", signal: AbortSignal.timeout(15_000) });
      const data = (await res.json()) as { delivered: number; error?: string };
      setMessage(data.error ?? (data.delivered ? `Sent to ${data.delivered} device(s).` : "No device received it. Try turning notifications off and on."));
    } catch {
      setMessage("The test didn't go through (timeout). Alerts still show in the app.");
    } finally {
      setBusy(false);
    }
  }

  const text: Record<Status, string> = {
    checking: "Checking…",
    unsupported: "This browser can't receive push notifications. On iPhone, add Trailmate to your Home Screen first. You'll still see alerts in the app.",
    "no-keys": "Push is off on the server (no VAPID keys in .env — run npm run push:keys). Alerts still show in the app.",
    blocked: "Notifications are blocked for this site. Allow them in your browser's site settings.",
    off: "Get alerts on this device even when Trailmate is closed.",
    on: "Notifications are on for this device.",
  };

  return (
    <div className="space-y-2">
      <p className="text-sm">{text[status]}</p>
      <div className="flex gap-2">
        {status === "off" && (
          <button onClick={enable} disabled={busy} className="flex-1 rounded-full bg-accent py-2.5 text-sm font-semibold text-white disabled:opacity-60 dark:text-[#04201c]">
            Turn on notifications
          </button>
        )}
        {status === "on" && (
          <>
            <button onClick={test} disabled={busy} className="flex-1 rounded-full bg-accent py-2.5 text-sm font-semibold text-white disabled:opacity-60 dark:text-[#04201c]">
              Send a test
            </button>
            <button onClick={disable} disabled={busy} className="rounded-full border border-line px-4 py-2.5 text-sm">
              Turn off
            </button>
          </>
        )}
      </div>
      {message && <p role="status" className="text-xs text-muted">{message}</p>}
    </div>
  );
}
