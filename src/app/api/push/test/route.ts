import { NextResponse } from "next/server";
import { pushConfig, pushToAll } from "@/server/push";

export async function POST() {
  if (!pushConfig().enabled) return NextResponse.json({ delivered: 0, error: "Push is off: no VAPID keys in .env" }, { status: 503 });
  const delivered = await pushToAll({
    title: "Trailmate test 👋",
    body: "Notifications work. You'll get reminders and travel alerts here.",
    url: "/settings",
    tag: "test",
  });
  return NextResponse.json({ delivered });
}
