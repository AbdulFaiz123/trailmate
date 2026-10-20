import Link from "next/link";

export function TripTabs({ tripId, active }: { tripId: string; active: "timeline" | "lists" | "docs" }) {
  const tab = (key: typeof active, href: string, label: string) => (
    <Link
      href={href}
      aria-current={active === key ? "page" : undefined}
      className={`flex-1 rounded-full py-2 text-center text-sm font-medium ${
        active === key ? "bg-surface text-foreground shadow-sm" : "text-muted"
      }`}
    >
      {label}
    </Link>
  );
  return (
    <nav aria-label="Trip sections" className="flex gap-1 rounded-full bg-line/60 p-1">
      {tab("timeline", `/trips/${tripId}`, "Timeline")}
      {tab("lists", `/trips/${tripId}/lists`, "Lists & bags")}
      {tab("docs", `/trips/${tripId}/docs`, "Docs")}
    </nav>
  );
}
