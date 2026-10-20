import { NextResponse } from "next/server";
import { runSweep } from "@/server/scheduler";

/** For hosts without long-running servers: call this from an external cron every minute. */
export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json(await runSweep());
}
