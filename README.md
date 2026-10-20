# Trailmate

One home for everything a traveler needs on a trip: stays, legs, packing and
shopping lists, and live alerts when something goes wrong.

> Status: **Steps 1–7 done** — Phase 1 plus smart import (voice, photo/PDF, receipts). See [ARCHITECTURE.md](ARCHITECTURE.md) for how it fits together.

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
| `npm run build && npm start` | Production build — needed to test offline mode |

The demo trip always departs **7 days from today**, so "Next up" and the
countdowns look realistic whenever you seed.

## Folder structure (so far)

```
tests/
  checks.test.ts       Unit tests for src/lib/checks.ts
  lists.test.ts        Unit tests for baggage.ts, rules.ts, categorize.ts, geo.ts
  reminders.test.ts    Unit tests for reminders.ts
  impact.test.ts       Unit tests for impact.ts and the DB adapter (fake fetch)
  offline.test.ts      File-type checks, sample PDF structure, status cycle
  import.test.ts       Receipt matching, sanitizer, mock reader, OpenAI adapter (fake fetch)
scripts/
  copy-pdf-worker.mjs  Copies pdf.js's worker to public/ (runs before dev/build)
storage/               Uploaded documents (git-ignored, created on first upload)
prisma/
  schema.prisma        Data model (Trip, Leg, Stay, Task, Person, Document,
                       Dependency, Alert, Settings, PushSubscription)
  seed.ts              Demo trip: Berlin → Frankfurt (ICE) → Hyderabad → family home
  seed-helpers/        Builds the plain "SAMPLE" PDFs/PNG for the demo documents
src/
  app/
    page.tsx           Trip list
    trips/new/         "Create trip" form (server action + zod validation)
    trips/[id]/        Trip dashboard: Next up, trip checks, timeline by day
    trips/[id]/legs/   Add / edit / delete a leg
    trips/[id]/stays/  Add / edit / delete a stay
    trips/[id]/lists/  Buy & Pack lists, baggage meters, suggestions, customs
    trips/[id]/docs/   Documents vault: list, upload, view (PDF via pdf.js), delete
    offline/           Shown when a page wasn't saved for offline yet
    trips/[id]/import/ Smart import: record / upload / paste → review → save
    trips/import-actions.ts  Saves what you confirmed on the review screen
    trips/actions.ts   Server action: create trip
    trips/item-actions.ts  Server actions: save/delete legs and stays
    trips/task-actions.ts  Server actions: list items, suggestions, baggage
    alerts/            Alerts list; alerts/open/[id] marks read and redirects
    settings/          Alert switches, quiet hours, push on/off, dev "pretend time"
    alert-actions.ts   Server actions: settings, mark read, run sweep at a time
    api/push/          Save/remove a push subscription, send a test
    api/alerts/        Unread count + latest (polled by the bell)
    api/cron/sweep/    Run the reminder sweep from an external cron
    api/documents/     Upload (type-checked, 15 MB max); [id]/file serves it
    api/sync/          Applies changes queued offline (idempotent)
    api/import/        Reads a recording/photo/PDF/text into a draft (saves nothing)
    manifest.ts        PWA manifest (installable, needed for push on iPhone)
  instrumentation.ts   Starts the background scheduler when the server boots
  server/
    scheduler.ts       Every minute: due reminders -> Alerts -> push
    push.ts            Web Push adapter (timeout, retry, off without keys)
    settings.ts        The single Settings row
    alerts.ts          Store alerts (de-duplicated) and deliver them
    disruption.ts      Poll legs, detect changes, impact check, alert
    transport/         Live status adapters: db-rest (DB live), mock, flight mock
    storage.ts         Local file storage + "is this really a PDF/image?" checks
    people.ts          Find-or-create gift recipients
    ai/                Smart import: OpenAI adapter, mock reader, prompt, orchestration
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
    outbox.ts          Browser-side queue of offline changes
    task-status.ts     Status cycle + quick-add parsing (shared by server and browser)
    import/            Draft format + JSON schema, sanitizer, receipt matching, place→zone
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

## Documents vault and offline mode (step 6)

**Documents**: the trip's **Docs** tab. Upload a PDF or photo (up to 15 MB)
and attach it to the whole trip, a leg or a stay; it also shows on that leg's
or stay's page and as 📎 on the timeline. Files are stored in `storage/`
(set `STORAGE_DIR`), never in git. The server checks the file's real bytes —
an `.exe` renamed to `.pdf`, or an SVG, is refused. PDFs are drawn with pdf.js
so they also show on phones (Android Chrome won't show PDFs inside a page).

**Offline**: opening a trip while online saves it on the device — dashboard,
both lists, every leg and stay page, the documents and their files (the trip
says "✓ Available offline · saved 22:45"). With no connection those pages open
from the saved copy and a banner says you're offline. Ticking items as
bought/packed and quick-adding still work: the changes wait in an outbox and
sync when you're back online (repeated taps collapse into one; replaying can't
create duplicates; a newer change on the server wins).

### Test airplane mode

Offline saving only runs in a production build (in dev it would cache stale code).

```bash
npm run build && npm start
```

1. Open http://localhost:3000, open the demo trip and wait for
   "✓ Available offline".
2. Turn on airplane mode (or stop the server, or DevTools → Network → Offline).
3. Reload: the trip, Lists & bags, Docs and the sample e-ticket PDF still open.
4. Tick "Passport" as packed — it gets an amber dot (waiting to sync).
5. Go back online: the dot disappears and the change is saved.

## Roadmap

| Step | What                                                         | Status |
| ---- | ------------------------------------------------------------ | ------ |
| 1    | Data model, demo trip, timeline                              | ✅     |
| 2    | Stays, legs, gap/overlap/connection checks                   | ✅     |
| 3    | Lists, baggage weight, country rules                         | ✅     |
| 4    | Notifications and reminders                                  | ✅     |
| 5    | Live tracking, disruption impact check, "Simulate delay"     | ✅     |
| 6    | Offline support and the documents vault                      | ✅     |
| 7    | **Smart import**: voice message, photo/PDF of a booking, or a shop receipt → AI drafts legs, stays and list updates → you review before saving | ✅ |

## Smart import (step 7)

Trip → **✨ Import**. Three ways in:

| Input | What happens |
| ----- | ------------ |
| 🎤 Voice | Record (or pick an audio file) → OpenAI `gpt-transcribe` → text → read like pasted text |
| 📷 Photo / PDF | Ticket, booking confirmation or shop receipt → OpenAI reads the image/PDF |
| 📝 Paste | A booking email or a note like "ICE 597 from Berlin to Frankfurt on 27 Oct 09:51–14:05. Buy 2 adapters for Dad." |

Everything becomes one **draft** (legs, stays, list items, receipt lines) on a
**review screen**: untick or edit anything, then **Save**. Nothing is saved
before that. The app checks every time zone and time (arrival after departure,
like the forms), flags legs already in your trip, and receipt lines tick off the
matching Buy item and store the real price ("RITTER SPORT VOLLMILCH 100G" →
*Ritter Sport chocolates*). The original photo/PDF can be kept in Docs, linked
to the leg or stay it created.

**Set up OpenAI** — put your key in `.env` yourself (never in chat or git):

```bash
echo 'OPENAI_API_KEY="sk-..."' >> .env
```

then restart the server. `OPENAI_MODEL` (default `gpt-6.1-sol`) and
`OPENAI_TRANSCRIBE_MODEL` (default `gpt-transcribe`) can be changed in `.env`.
Requests use Structured Outputs (a strict JSON schema) and `store: false`.

**Without a key** pasted text uses a simple built-in reader, and the demo
receipt / demo voice note show the review screen. Photos, PDFs and real
recordings need the key.
