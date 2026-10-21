import Link from "next/link";
import { prisma } from "@/lib/db";
import { allTimeZones } from "@/lib/time";
import { importEngine } from "@/server/ai/import";
import { NewTripChooser } from "./NewTripChooser";
import { isDemo } from "@/lib/demo";

export const dynamic = "force-dynamic";

export default async function NewTripPage() {
  const settings = await prisma.settings.findUnique({ where: { id: "me" } });
  return (
    <div className="space-y-4">
      <div>
        <Link href="/" className="text-xs text-muted">← All trips</Link>
        <h1 className="mt-1 text-xl font-semibold">New trip</h1>
      </div>
      <NewTripChooser
        engine={importEngine()}
        model={process.env.OPENAI_MODEL || "gpt-6.1-sol"}
        zones={allTimeZones()}
        demo={isDemo()}
        formDefaults={{ originCountry: "DE", homeCurrency: "EUR", homeTimeZone: settings?.homeTimeZone ?? "Europe/Berlin" }}
      />
    </div>
  );
}
