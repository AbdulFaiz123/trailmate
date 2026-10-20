# Trailmate architecture

A short tour of the three ideas the app is built on: **one timeline**, **items
that depend on each other**, and **a disruption check** that reruns the same
rules whenever something changes.

## 1. The Trip Timeline

A trip lives in three tables: `Leg` (a movement), `Stay` (a place to sleep)
and `Task` (something to buy, pack or do). `src/lib/timeline.ts` merges them
into one sorted list:

- a leg becomes one entry, at its departure;
- a stay becomes two entries, check-in and check-out;
- a task appears only if it has a deadline (buy-by / due).

**Time rule:** every instant is stored in UTC, and every place stores its IANA
time zone (`Europe/Berlin`, `Asia/Kolkata`). Sorting uses UTC, so 17:30 in
Frankfurt correctly comes before 07:20 next morning in Hyderabad. Display uses
the zone of *that item's place*, always with its label (CET / CEST / IST).
Forms take the local time printed on the ticket and convert it on the server.
Trip start/end are plain `"YYYY-MM-DD"` strings, because a calendar date has
no time zone.

## 2. Dependencies and connections

Two legs are a **connection** when the second leaves within 12 h of the first
arriving with no stay check-in in between (`findConnections` in
`src/lib/checks.ts`). For each connection we measure the transfer and compare
it with two thresholds:

| Next leg                  | Tight below | Missed below |
| ------------------------- | ----------- | ------------ |
| Train / bus / ferry       | 15 min      | 3 min        |
| International flight      | 90 min      | 60 min       |
| Domestic flight           | 45 min      | 30 min       |
| After landing (any)       | 45 min      | 20 min       |

A `Dependency` row says "B needs A to finish at least N minutes before B
starts". It overrides the "missed" threshold (the demo trip says the ICE → S8
change needs 4 min; the S-Bahn → flight needs 90). Dependencies point at items
by `(kind, id)` because the items live in different tables, so deleting an item
also deletes its dependencies in the same transaction.

The same pure functions produce the dashboard's **trip checks**: night gaps
(tested at 02:00 local, in whatever zone you are in), overlapping stays,
arriving after the latest check-in, and tight/missed connections.

## 3. Live tracking and the disruption check

```
 every minute (src/server/scheduler.ts)
   ├─ reminders: due reminders → Alerts → push
   └─ pollLegs: legs leaving within 24 h
        │  every 5 min, every 2 min in the last 2 h
        ▼
   provider.getStatus(leg)            src/server/transport/
        │  DB live (timeout 8 s, 1 retry, 10-min back-off) / flight mock / mock
        ▼
   applyLegStatus                     src/server/disruption.ts
        │  save delay / cancelled / platform
        │  changed? (delay moved by a 5-min step, cancelled, new platform)
        ▼
   assessImpact(trip, leg)            src/lib/impact.ts  (pure)
        │  re-run findConnections with the new times
        │  missed something? → ask the provider for the next service,
        │                      else estimate it (S-Bahn every 15 min, …)
        │  can the leg *after* that still be reached?
        │  any stay now reached after its latest check-in?
        ▼
   Alert (dedupeKey = leg + delay step + cancelled + platform)
        ▼
   deliverPending → Web Push now (urgent ones ignore quiet hours)
```

A delay is just a change to `departureDelayMin` / `arrivalDelayMin`.
Everything downstream (timeline times, connection lines, trip checks,
"Leave now" reminders, the disruption banner) reads *effective* times
(`effectiveDeparture` / `effectiveArrival`), so it all updates from that one
change.

**"Simulate delay"** (dev & demo only) calls the same `applyLegStatus` with a
made-up status, so the demo exercises the real pipeline. A simulated leg is
skipped by the poller until you press *Reset*.

### Adapters

Every external source sits behind `LegStatusProvider` (`src/server/transport/types.ts`):

| Provider      | Used for                                 | Notes |
| ------------- | ---------------------------------------- | ----- |
| `db-rest`     | Trains with a DB station id and a number | `v6.db.transport.rest`, no key |
| `flight-mock` | Flights                                  | Real flight status is Phase 2 |
| `mock`        | Indian rail, buses, taxis, everything else | Changes only via "Simulate delay" |

When a source is down, the leg keeps its last known status and shows a note
("DB live data unavailable — showing the timetable"); the app never blocks on it.

## 4. Alerts and delivery

Reminders (`src/lib/reminders.ts`) and disruptions both end up as `Alert` rows.
The unique `dedupeKey` is what makes "check every minute" safe: the same
reminder is stored and sent once. Delivery (`src/server/alerts.ts`) pushes
unsent alerts, holds non-urgent ones during quiet hours (in the traveler's
current zone), and bundles more than two into one summary. Without push the
same alerts show in the bell, pop-ups, the trip banner and the Alerts page.

## 5. Offline

The app is server-rendered, so "offline" means keeping copies of what the
server sent (`public/sw.js`):

| Request                       | Strategy                                         |
| ----------------------------- | ------------------------------------------------ |
| `/_next/static/*`, icons, pdf.js worker | cache first — file names change when content does |
| `/api/documents/<id>/file`    | cache first — an uploaded file never changes     |
| Pages                         | network first (4 s), then the saved copy, then `/offline` |
| In-app navigation data (RSC)  | network only; if it fails Next does a full page load, which the row above answers |
| Other `/api/*`                | network only (live data)                         |

**Saving a trip**: the dashboard's `OfflineSaver` sends the service worker a
list of the trip's pages and document files; the worker fetches each page and
the scripts it references, and the browser reports any scripts it loaded on
demand (the PDF viewer) so those are kept too. It re-saves when the trip's
data changes, and checks the cache itself rather than trusting a "saved" flag
(an app update clears old caches).

**Writing offline**: list changes go to an outbox in `localStorage`
(`src/lib/outbox.ts`) and are sent to `/api/sync` when the browser is online.
Status taps on one item collapse into the last one; new items carry a
`clientId` (unique in the database), so a replay can't duplicate them; and a
change is skipped if the server already has a newer one (last write wins).

## 6. Smart import

```
 voice ─ gpt-transcribe ─┐
 photo / PDF ────────────┼─► parser.parse() ─► sanitizeDraft() ─► review screen ─► applyImport()
 pasted text ────────────┘   (OpenAI or mock)   zones, times,        edit / untick     same checks as
                                                 duplicates           anything          the forms
```

- `ImportParser` (`src/server/ai/types.ts`) has two implementations: OpenAI
  (Responses API with a strict JSON schema; images as `input_image`, PDFs as
  `input_file`) and a regex-based mock for pasted text.
- The prompt carries trip context (dates, existing legs, the Buy list, people)
  so "on the 27th" or "for Mom" resolve, and tells the model to treat document
  text as data, not instructions.
- **Nothing an AI returns is trusted**: `sanitizeDraft` re-checks every field,
  fills missing zones from place names, and adds warnings; the review screen
  shows them; `applyImport` validates again and saves all-or-nothing.
- Receipts: the parser may name the Buy item a line is ("Anti Brumm" → *Mosquito
  repellent*); otherwise `matchPurchases` pairs lines with open Buy items by word
  overlap (case and umlauts folded). The traveler can change any pairing.
- **New trip from an import**: `runImport(null, …)` uses a new-trip prompt and
  `sanitizeDraft(…, newTripDefaults)` fills the trip details from the legs;
  `createTripFromImport` validates them with the same `TripInput` schema as the
  form, creates the trip and reuses `saveImport` (deleting the trip again if a
  leg fails its checks, so no half-made trips are left behind).

## 7. Where Phase 2 plugs in

- **Re-routing**: `findAlternative` already exists on providers; a richer
  planner can return multi-leg alternatives.
- **Budget**: money is already stored as minor units + currency everywhere.
- **Real flight / IRCTC adapters**: implement `LegStatusProvider`, register it
  in `src/server/transport/index.ts`.
- **Postgres**: change the Prisma provider; string "enum" columns were chosen
  so nothing else changes.
