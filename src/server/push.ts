// Web Push adapter. Like every external call in Trailmate it has a timeout,
// one retry and a clear fallback: with no VAPID keys, push is simply off and
// alerts are shown in the app instead.
import webpush from "web-push";
import { prisma } from "@/lib/db";

export type PushPayload = { title: string; body: string; url: string; tag?: string };
type Subscription = { endpoint: string; p256dh: string; auth: string };
type Result = "ok" | "gone" | "error";

const TIMEOUT_MS = 8_000;

export function pushConfig() {
  const publicKey = process.env.VAPID_PUBLIC_KEY ?? "";
  const privateKey = process.env.VAPID_PRIVATE_KEY ?? "";
  return { enabled: Boolean(publicKey && privateKey), publicKey, privateKey, subject: process.env.VAPID_SUBJECT || "mailto:trailmate@example.com" };
}

async function sendOne(sub: Subscription, payload: PushPayload): Promise<Result> {
  const cfg = pushConfig();
  const options = {
    vapidDetails: { subject: cfg.subject, publicKey: cfg.publicKey, privateKey: cfg.privateKey },
    timeout: TIMEOUT_MS,
    TTL: 60 * 60, // a push that can't be delivered within an hour is stale
  };
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, JSON.stringify(payload), options);
      return "ok";
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) return "gone"; // browser unsubscribed
      if (attempt === 2 || (status && status < 500)) {
        console.warn(`[push] failed (${status ?? (err as Error).message})`);
        return "error";
      }
      await new Promise((r) => setTimeout(r, 1_000)); // one retry for timeouts / 5xx
    }
  }
  return "error";
}

/** Send to every subscribed device. Returns how many devices got it. */
export async function pushToAll(payload: PushPayload): Promise<number> {
  if (!pushConfig().enabled) return 0;
  const subs = await prisma.pushSubscription.findMany();
  let delivered = 0;
  for (const sub of subs) {
    const result = await sendOne(sub, payload);
    if (result === "ok") delivered++;
    if (result === "gone") await prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {});
  }
  return delivered;
}
