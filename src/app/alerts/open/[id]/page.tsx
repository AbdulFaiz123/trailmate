import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { OpenAlert } from "./OpenAlert";

export const dynamic = "force-dynamic";

/**
 * Where tapping a notification or an alert lands. Reading this page changes
 * nothing (link prefetches and chat link previews hit it too); the browser
 * marks the alert read once it has actually opened, then moves on.
 */
export default async function OpenAlertPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const alert = await prisma.alert.findUnique({ where: { id }, select: { id: true, title: true, url: true } });
  if (!alert) notFound();
  return <OpenAlert id={alert.id} title={alert.title} url={alert.url ?? "/alerts"} />;
}
