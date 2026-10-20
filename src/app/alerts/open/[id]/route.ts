import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

/** Tapping a notification lands here: mark it read, then go where it points. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const alert = await prisma.alert.update({ where: { id }, data: { readAt: new Date() } }).catch(() => null);
  return NextResponse.redirect(new URL(alert?.url ?? "/alerts", req.url));
}
