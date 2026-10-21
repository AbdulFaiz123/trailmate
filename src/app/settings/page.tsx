import { prisma } from "@/lib/db";
import { allReminders } from "@/lib/reminders";
import { toLocalInput } from "@/lib/time";
import { demoToolsEnabled, getSettings } from "@/server/settings";
import { pushConfig } from "@/server/push";
import { Section } from "@/components/form";
import { SettingsForm } from "./SettingsForm";
import { PushControls } from "./PushControls";
import { DevTools } from "./DevTools";
import { logout } from "../login/actions";
import { sessionSecret } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const settings = await getSettings();
  const defaults = Object.fromEntries(Object.entries(settings).map(([k, v]) => [k, v == null ? "" : String(v)]));

  // Dev tools: offer the moments when the next trip's reminders fire.
  let suggestions: { label: string; value: string }[] = [];
  if (demoToolsEnabled()) {
    const trip = await prisma.trip.findFirst({
      orderBy: { startDate: "asc" },
      include: { legs: true, stays: true, tasks: { include: { person: true } } },
    });
    if (trip) {
      const seen = new Set<string>();
      suggestions = allReminders(trip, { ...settings, alertBuyBy: true, alertNearbyShop: true, alertPacking: true, alertLeaveNow: true, alertCheckIn: true })
        .filter((r) => !seen.has(r.type) && seen.add(r.type))
        .map((r) => ({
          label: { BUY_BY: "Buy-by", NEARBY_SHOP: "At a stay near a shop", PACKING: "Packing evening", LEAVE_NOW: "Leave now", CHECK_IN: "Flight check-in" }[r.type],
          value: toLocalInput(new Date(r.fireAt.getTime() + 60_000), settings.homeTimeZone),
        }));
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Settings</h1>
      <Section title="Notifications on this device">
        <PushControls publicKey={pushConfig().publicKey} />
      </Section>
      <SettingsForm defaults={defaults} />
      {demoToolsEnabled() && (
        <Section title="Developer tools">
          <p className="text-xs text-muted">
            Reminders fire days from now. Run the sweep at a pretend time to see them now. Times are in your home zone ({settings.homeTimeZone}).
          </p>
          <DevTools suggestions={suggestions} />
        </Section>
      )}
      {sessionSecret() && (
        <form action={logout} className="text-center">
          <button className="text-sm font-medium text-red-600 underline-offset-2 hover:underline dark:text-red-400">Log out</button>
        </form>
      )}
    </div>
  );
}
