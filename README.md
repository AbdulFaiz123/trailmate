# Trailmate

One home for everything a traveler needs on a trip: stays, legs, packing and
shopping lists, and live alerts when something goes wrong.

> Status: **Step 3 of 6** — timeline, stays, legs, trip checks, lists, baggage and country rules.

## Setup

Requires Node 20+.

```bash
npm install
cp .env.example .env          # only DATABASE_URL for now
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
| `npm test`          | Unit tests for checks, baggage and rules (`tests/`) |

The demo trip always departs **7 days from today**, so "Next up" and the
countdowns look realistic whenever you seed.

## Folder structure (so far)

```
tests/
  checks.test.ts       Unit tests for src/lib/checks.ts
  lists.test.ts        Unit tests for baggage.ts, rules.ts, categorize.ts
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
  components/          LocalTime, NextUpCard, TimelineEntryCard, TripChecks,
                       ConnectionLine, TripTabs, forms/, lists/
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
