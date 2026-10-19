import Link from "next/link";
import { prisma } from "@/lib/db";
import { TripForm } from "./TripForm";

export const dynamic = "force-dynamic";

export default async function NewTripPage() {
  const settings = await prisma.settings.findUnique({ where: { id: "me" } });
  return (
    <div className="space-y-4">
      <div>
        <Link href="/" className="text-xs text-muted">← All trips</Link>
        <h1 className="mt-1 text-xl font-semibold">New trip</h1>
      </div>
      <TripForm defaults={{ originCountry: "DE", homeCurrency: "EUR", homeTimeZone: settings?.homeTimeZone ?? "Europe/Berlin" }} />
    </div>
  );
}
