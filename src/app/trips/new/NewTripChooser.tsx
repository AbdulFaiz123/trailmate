"use client";

import { useState } from "react";
import { ImportFlow } from "@/components/import/ImportFlow";
import { TripForm } from "./TripForm";

type How = "voice" | "file" | "form" | null;

/** "How do you want to start?" — say it, upload a ticket, or fill the form. */
export function NewTripChooser({ engine, model, zones, formDefaults, demo = false }: {
  engine: "openai" | "mock"; model: string; zones: string[]; formDefaults: Record<string, string>; demo?: boolean;
}) {
  const [how, setHow] = useState<How>(null);

  if (how === "form") {
    return (
      <div className="space-y-3">
        <button type="button" onClick={() => setHow(null)} className="text-xs text-muted">← Other ways to start</button>
        <TripForm defaults={formDefaults} />
      </div>
    );
  }
  if (how) {
    return (
      <div className="space-y-3">
        <button type="button" onClick={() => setHow(null)} className="text-xs text-muted">← Other ways to start</button>
        <ImportFlow tripId={null} engine={engine} model={model} zones={zones} openTasks={[]} initialTab={how} demo={demo} />
      </div>
    );
  }

  const option = (key: Exclude<How, null>, icon: string, title: string, text: string, badge?: string) => (
    <button type="button" onClick={() => setHow(key)} className="flex w-full items-center gap-3 rounded-2xl border border-line bg-surface p-4 text-left active:scale-[0.99]">
      <span aria-hidden className="text-3xl">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold">{title}{badge && <span className="ml-2 rounded-full bg-accent-soft px-2 py-0.5 text-[10px] font-semibold text-accent">{badge}</span>}</span>
        <span className="block text-xs text-muted">{text}</span>
      </span>
      <span aria-hidden className="text-muted">›</span>
    </button>
  );

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted">How do you want to start?</p>
      {option("voice", "🎤", "Tell me about your trip", "Say where you’re going, when, and how. I’ll set it up.", engine === "openai" ? "AI" : undefined)}
      {option("file", "📄", "Upload a ticket or booking", "A flight or train ticket, hotel booking or itinerary — photo or PDF.", engine === "openai" ? "AI" : undefined)}
      {option("form", "✍️", "Fill in the form", "Type the name, places and dates yourself.")}
      {engine !== "openai" && (
        <p className="text-[11px] text-muted">
          {demo ? "Demo: voice and uploads show a sample result here. In the full app, OpenAI reads your recording or ticket." : <>Voice and uploads need <code className="font-mono">OPENAI_API_KEY</code> in .env — you can still try the demo.</>}
        </p>
      )}
    </div>
  );
}
