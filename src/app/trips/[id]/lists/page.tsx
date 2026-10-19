import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { summarizeBag, baggageWarnings } from "@/lib/baggage";
import { countryRules, customsReminders, suggestionsFor } from "@/lib/rules";
import { quickAddTask } from "@/app/trips/task-actions";
import { formatMoney, modeLabel } from "@/lib/format";
import { TASK_CATEGORIES } from "@/lib/types";
import { TripTabs } from "@/components/TripTabs";
import { TripChecks } from "@/components/TripChecks";
import { BaggageCard } from "@/components/lists/BaggageCard";
import { TaskRow } from "@/components/lists/TaskRow";
import { SuggestionsCard } from "@/components/lists/SuggestionsCard";
import { CustomsCard } from "@/components/lists/CustomsCard";
import { QuickAdd } from "@/components/lists/QuickAdd";

export const dynamic = "force-dynamic";

const CATEGORY_ICON: Record<string, string> = {
  GIFTS: "🎁", ELECTRONICS: "🔌", CLOTHES: "👕", DOCUMENTS: "🛂", TOILETRIES: "🧴", MEDICINE: "💊", FOOD: "🍫", OTHER: "📦",
};

export default async function ListsPage({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }>;
}) {
  const { id } = await params;
  const { tab } = await searchParams;
  const list = tab === "PACK" ? "PACK" : "BUY";

  const trip = await prisma.trip.findUnique({
    where: { id },
    include: { tasks: { include: { person: true }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] } },
  });
  if (!trip) notFound();
  const now = new Date();

  const checked = summarizeBag(trip, trip.tasks, "CHECKED");
  const cabin = summarizeBag(trip, trip.tasks, "CABIN");
  const bagWarnings = baggageWarnings([checked, cabin]);
  const suggestions = suggestionsFor(trip, trip.tasks);
  const customs = customsReminders(trip, trip.tasks);

  const items = trip.tasks.filter((t) => t.list === list);
  const counts = {
    BUY: trip.tasks.filter((t) => t.list === "BUY" && t.status === "TO_BUY").length,
    PACK: trip.tasks.filter((t) => t.list === "PACK" && t.status !== "PACKED").length,
  };
  const stillToSpend = trip.tasks
    .filter((t) => t.list === "BUY" && t.status === "TO_BUY" && t.priceMinor != null && t.currency === trip.homeCurrency)
    .reduce((sum, t) => sum + t.priceMinor! * t.quantity, 0);
  const byCategory = TASK_CATEGORIES.map((c) => ({ category: c, items: items.filter((t) => (t.category ?? "OTHER") === c) })).filter(
    (g) => g.items.length,
  );

  return (
    <div className="space-y-4">
      <div>
        <Link href="/" className="text-xs text-muted">← All trips</Link>
        <h1 className="mt-1 text-xl font-semibold leading-tight">{trip.name}</h1>
      </div>
      <TripTabs tripId={trip.id} active="lists" />

      <BaggageCard tripId={trip.id} checked={checked} cabin={cabin} />
      {bagWarnings.length > 0 && <TripChecks warnings={bagWarnings} tripId={trip.id} title="Baggage" />}

      <nav aria-label="Lists" className="flex gap-2">
        {(["BUY", "PACK"] as const).map((l) => (
          <Link
            key={l}
            href={`/trips/${trip.id}/lists?tab=${l}`}
            aria-current={list === l ? "page" : undefined}
            className={`flex-1 rounded-2xl border px-3 py-2.5 ${list === l ? "border-accent bg-accent-soft" : "border-line bg-surface"}`}
          >
            <span className="block text-sm font-semibold">{l === "BUY" ? "🛍️ Buy" : "🧳 Pack"}</span>
            <span className="text-[11px] text-muted">
              {counts[l]} left{l === "BUY" && stillToSpend > 0 ? ` · ≈ ${formatMoney(stillToSpend, trip.homeCurrency)}` : ""}
            </span>
          </Link>
        ))}
      </nav>

      <SuggestionsCard tripId={trip.id} list={list} suggestions={suggestions} countryName={countryRules(trip.destinationCountry)?.name} />

      {byCategory.length === 0 && (
        <p className="rounded-2xl border border-dashed border-line p-6 text-center text-sm text-muted">
          Nothing on this list yet. Type below to add something.
        </p>
      )}
      {byCategory.map((group) => (
        <section key={group.category} aria-label={group.category}>
          <h2 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
            {CATEGORY_ICON[group.category]} {modeLabel(group.category)}
          </h2>
          <ul className="space-y-1.5">
            {group.items.map((t) => (
              <TaskRow key={t.id} task={t} tripId={trip.id} homeTimeZone={trip.homeTimeZone} now={now} />
            ))}
          </ul>
        </section>
      ))}

      <CustomsCard reminders={customs} />

      <QuickAdd action={quickAddTask.bind(null, trip.id, list)} list={list} newHref={`/trips/${trip.id}/lists/new?list=${list}`} />
    </div>
  );
}
