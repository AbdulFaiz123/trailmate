# Trailmate

One home for everything a traveler needs on a trip: stays, legs, packing and
shopping lists, and live alerts when something goes wrong.

> Status: **Step 5 of 6** — everything up to live tracking, the disruption impact check and "Simulate delay". See [ARCHITECTURE.md](ARCHITECTURE.md) for how it fits together.

## Setup

Requires Node 20+.

```bash
npm install
cp .env.example .env          # then: npm run push:keys, paste the keys into .env
npx prisma migrate dev        # creates prisma/dev.db and the tables
npm run db:seed               # loads the Berlin → Hyderabad demo trip
npm run dev                   # http://localhost:3000
```

Useful scripts:

| Script              | What it does                                       |
| ------------------- | -------------------------------------------------- |
| `npm run dev`       | Start the app in development mode                  |
| `npm run db:seed`   | Wipe the database and load the demo trip again     |
| `npm run db:reset`  | Drop the database, re-run migrations and the seed  |
| `npm run db:studio` | Open Prisma Studio to browse/edit the data         |
| `npm test`          | Unit tests for checks, baggage, rules, reminders (`tests/`) |
| `npm run push:keys` | Generate a VAPID key pair for Web Push              |

The demo trip always departs **7 days from today**, so "Next up" and the
countdowns look realistic whenever you seed.

## Folder structure (so far)

```
tests/
  checks.test.ts       Unit tests for src/lib/checks.ts
  lists.test.ts        Unit tests for baggage.ts, rules.ts, categorize.ts, geo.ts
  reminders.test.ts    Unit tests for reminders.ts
  impact.test.ts       Unit tests for impact.ts and the DB adapter (fake fetch)
prisma/
  schema.prisma        Data model (Trip, Leg, Stay, Task, Person, Document,
                       Dependency, Alert, Settings, PushSubscription)
  seed.ts              Demo trip: Berlin → Frankfurt (ICE) → Hyderabad → family home
src/
  app/
    page.tsx           Trip list
    trips/new/         "Create trip" form (server action + zod validation)
    trips/[id]/        Trip dashboard: Next up, trip checks, timeline by day
    trips/[id]/legs/   Add / edit / delete a leg
    trips/[id]/stays/  Add / edit / delete a stay
    trips/[id]/lists/  Buy & Pack lists, baggage meters, suggestions, customs
    trips/actions.ts   Server action: create trip
    trips/item-actions.ts  Server actions: save/delete legs and stays
    trips/task-actions.ts  Server actions: list items, suggestions, baggage
    alerts/            Alerts list; alerts/open/[id] marks read and redirects
    settings/          Alert switches, quiet hours, push on/off, dev "pretend time"
    alert-actions.ts   Server actions: settings, mark read, run sweep at a time
    api/push/          Save/remove a push subscription, send a test
    api/alerts/        Unread count + latest (polled by the bell)
    api/cron/sweep/    Run the reminder sweep from an external cron
    manifest.ts        PWA manifest (installable, needed for push on iPhone)
  instrumentation.ts   Starts the background scheduler when the server boots
  server/
    scheduler.ts       Every minute: due reminders -> Alerts -> push
    push.ts            Web Push adapter (timeout, retry, off without keys)
    settings.ts        The single Settings row
    alerts.ts          Store alerts (de-duplicated) and deliver them
    disruption.ts      Poll legs, detect changes, impact check, alert
    transport/         Live status adapters: db-rest (DB live), mock, flight mock
  components/          LocalTime, NextUpCard, TimelineEntryCard, TripChecks,
                       ConnectionLine, TripTabs, AlertBell, AlertsBanner, forms/, lists/
  data/
    country-rules.json Editable suggestions + customs/airline rules per country
  lib/
    db.ts              Prisma client (one instance across hot reloads)
    time.ts            Time zone helpers — store UTC, display local
    timeline.ts        Merges legs, stays and tasks into one sorted timeline
    checks.ts          Gap / overlap / late-arrival / connection checks (pure functions)
    form-defaults.ts   DB row <-> form values, smart defaults for new items
    baggage.ts         Bag weight totals and over/near-limit warnings
    rules.ts           Reads country-rules.json: suggestions + customs reminders
    categorize.ts      Guesses a category from an item name (quick add)
    reminders.ts       Reminder rules: buy-by, shop nearby, packing, leave now, check-in
    geo.ts             Distance between two points, parse pasted coordinates
    impact.ts          What a delay/cancellation breaks + the next option
    types.ts           Allowed values for the string "enum" columns
    format.ts          Money, weight and icon helpers
```

## Trip checks (step 2)

The dashboard runs these on every load (`src/lib/checks.ts`):

| Check            | Rule                                                                                   |
| ---------------- | -------------------------------------------------------------------------------------- |
| Gap              | A night (tested at 02:00 local) with no stay, unless you're on a leg or in a layover of 6 h or less |
| Overlap          | Two stays cover the same night                                                         |
| Late arrival     | The leg bringing you to a stay arrives after its "latest check-in" (critical)          |
| Early arrival    | You arrive 3+ h before check-in opens (info)                                           |
| Tight connection | Transfer under 15 min (train/bus) or 90 min (international flight), 45 min after landing |
| Missed connection| Transfer below the minimum (a Dependency buffer if set), or a leg is cancelled         |

Two legs count as a connection when the second leaves within 12 h of the first
arriving and there is no stay check-in in between.

## Lists, baggage and country rules (step 3)

- **Buy** and **Pack** lists, grouped by category. Tap the circle to move an
  item along: *to buy → bought → packed* (Pack list: *not packed ↔ packed*).
  Type in the bar at the bottom to add quickly; `3x Haribo` sets the quantity.
- **Baggage tracker**: set the allowance and the weight of the empty bags under
  "Edit allowance & bag weights". The meter counts *everything planned* for a
  bag (light bar) and what's *already packed* (solid bar). It warns at 90 % and
  when you go over, here and on the dashboard.
  - Try it: add an item to the Buy list with weight `9000` g → the demo
    suitcase goes over 23 kg.
- **Country rules** live in [`src/data/country-rules.json`](src/data/country-rules.json):
  - `suggestions`: offered when the trip's destination matches (`"*"` = every trip).
    An item already on your lists (same keyword, e.g. "adapter") counts as added.
  - `customs`: reminders of type `info`, `match` (keyword found), `quantity`,
    `value` (total price vs. a limit, using rough `approxRates`) or `bag`
    (e.g. power bank in the checked bag). `entry` rules use the destination,
    `return` rules use your home country, `airline` rules apply to every trip.
  - Keywords match whole words (so "gin" doesn't match "original").
  - These are reminders with a link to the official source, **not legal advice**.

## Reminders and notifications (step 4)

A background job (`src/server/scheduler.ts`, started from `src/instrumentation.ts`)
runs every minute. It asks `src/lib/reminders.ts` which reminders are due,
stores new ones as **Alerts** (a unique `dedupeKey` means each one is stored
and sent once), and pushes them.

| Reminder      | When                                                                 |
| ------------- | -------------------------------------------------------------------- |
| Buy-by        | 3 days before the buy-by date, the morning of, and once if you missed it |
| Shop nearby   | During a stay that's within 2 km of a shop on your Buy list          |
| Packing       | 19:00 the evening before you leave, listing what isn't packed/bought |
| Leave now     | Departure − your travel buffer (taxis: 5 min). Only for legs you start from a standstill. A delay creates a corrected alert |
| Check-in      | Flights 24 h before departure; hotels 3 h before check-in            |

- **Push**: turn it on in ⚙️ Settings. Needs VAPID keys in `.env`
  (`npm run push:keys`). On iPhone, add Trailmate to the Home Screen first.
- **No push?** Alerts still appear: 🔔 bell count, a pop-up while the app is
  open, a banner on the trip, and the Alerts page.
- **Quiet hours** use the time zone you're in at that moment. Only urgent
  alerts (leave now; cancellations in step 5) are pushed then; the rest wait.
- More than two alerts at once are sent as one summary notification.
- Every alert type can be switched off in Settings.

### Testing reminders without waiting days

Settings → **Developer tools** → pick a quick time (Buy-by, Flight check-in,
Packing evening, Leave now, At a stay near a shop) or any date and time. This
runs the sweep as if it were that moment. Note: the real background job keeps
running on the real clock, so alerts held back by pretend quiet hours are
released by the next real tick if it isn't quiet right now.

## Live tracking and "Simulate delay" (step 5)

- Legs leaving within 24 h are polled every 5 min, every 2 min in the last 2 h.
- **German trains** with a DB station id (EVA number, e.g. Berlin Hbf `8011160`)
  and a train number use Deutsche Bahn live data (`v6.db.transport.rest`, free,
  no key). Flights use a mock for now; everything else uses mock data.
- Each call has an 8 s timeout and one retry. If DB is down, the app backs off
  for 10 minutes and shows "DB live data unavailable — showing the timetable".
- A change (delay moved by 5+ min, cancellation, new platform/gate) runs the
  **impact check**: which connection breaks, the next option, whether the leg
  after that is still reachable, and whether you'll miss a hotel check-in. The
  result is pushed straight away and shown as a banner on the trip.

### Test it with "Simulate delay"

1. Open the demo trip. Under the **ICE 597** card tap **⏱ Simulate delay → +40 min**
   (or open the leg; the same controls are in *Live status*).
2. You'll see: the ICE card turns red (+40 min, new times), the line to the S8
   says *Missed*, a **Disruption** banner says
   *"…You will miss the 14:16 S8. Your LH 752 is still reachable via S8 at 15:01…
   → Take S8 at 15:01"*, and a notification arrives (if push is on).
3. Try **+60**, **Cancel** on the S8, or a **Platform change**. Press **Reset**
   to go back to the timetable (you get a "back on time" note).

Simulation is available in development, or anywhere with `DEMO_TOOLS=1`.

## Roadmap

| Step | What                                                         | Status |
| ---- | ------------------------------------------------------------ | ------ |
| 1    | Data model, demo trip, timeline                              | ✅     |
| 2    | Stays, legs, gap/overlap/connection checks                   | ✅     |
| 3    | Lists, baggage weight, country rules                         | ✅     |
| 4    | Notifications and reminders                                  | ✅     |
| 5    | Live tracking, disruption impact check, "Simulate delay"     | ✅     |
| 6    | Offline support and the documents vault                      |        |
| 7    | **Smart import**: voice message, photo/PDF of a booking, or a shop receipt → AI drafts legs, stays and list updates → you review before saving | |

Step 7 notes:
- Images and PDFs go straight to Claude; voice is turned into text first
  (browser dictation, or a speech-to-text adapter).
- Always a review screen, never a silent save. Times are validated in the
  place's time zone, the same way the forms do.
- Receipts mark matching Buy items as bought and fill in the real price.
- Uploaded files are kept in the documents vault (step 6).
- A mock parser keeps it working with no API key.
