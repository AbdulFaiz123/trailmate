import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Unread, not-yet-stale alerts — polled by the bell for in-app pop-ups. */
export async function GET() {
  const now = new Date();
  const where = { readAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] };
  const [unread, latest] = await Promise.all([
    prisma.alert.count({ where }),
    prisma.alert.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { id: true, title: true, body: true, severity: true, urgent: true, createdAt: true },
    }),
  ]);
  return NextResponse.json({ unread, latest });
}
