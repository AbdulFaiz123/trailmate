// Seed: one realistic demo trip, Berlin -> Frankfurt (ICE) -> Hyderabad (flight)
// -> family home, and back.
//
// Dates are relative to "today" so the demo always looks upcoming: departure
// day (D0) is 7 days from now. Every time below is written as LOCAL wall-clock
// time in the place where it happens, then converted to UTC with localToUtc().
// That is exactly how a traveler reads a ticket.
import { PrismaClient } from "@prisma/client";
import { addDays } from "date-fns";
import { localDateKey, localToUtc } from "../src/lib/time";

const prisma = new PrismaClient();

const BER = "Europe/Berlin";
const HYD = "Asia/Kolkata";

async function main() {
  // Wipe everything so the seed can be re-run safely.
  await prisma.trip.deleteMany();
  await prisma.settings.deleteMany();

  const d = (offset: number) => localDateKey(addDays(new Date(), 7 + offset), BER);
  const D0 = d(0);
  const at = (dayOffset: number, hhmm: string, tz: string) => localToUtc(d(dayOffset), hhmm, tz);

  await prisma.settings.create({
    data: { id: "me", homeTimeZone: BER, leaveBufferMin: 20, quietHoursStart: "22:30", quietHoursEnd: "07:00" },
  });

  const trip = await prisma.trip.create({
    data: {
      name: "Family visit to Hyderabad",
      origin: "Berlin, Germany",
      destination: "Hyderabad, India",
      originCountry: "DE",
      destinationCountry: "IN",
      startDate: D0,
      endDate: d(14),
      homeCurrency: "EUR",
      homeTimeZone: BER,
      checkedAllowanceG: 23_000, // Lufthansa Economy: 1 x 23 kg
      cabinAllowanceG: 8_000,
      checkedTareG: 4_200, // empty 70 cm hard-shell suitcase
      cabinTareG: 2_300, // empty cabin trolley
    },
  });
  const tripId = trip.id;

  // ---------- Outbound ----------
  const taxiToHbf = await prisma.leg.create({
    data: {
      tripId, mode: "TAXI",
      fromName: "Home, Berlin-Kreuzberg", fromTimeZone: BER, fromLat: 52.4986, fromLng: 13.4033,
      toName: "Berlin Hbf", toTimeZone: BER, toLat: 52.5251, toLng: 13.3694,
      departureAt: at(0, "09:10", BER), arrivalAt: at(0, "09:30", BER),
      carrier: "FreeNow", costMinor: 2200, currency: "EUR",
    },
  });

  const ice = await prisma.leg.create({
    data: {
      tripId, mode: "TRAIN",
      fromName: "Berlin Hbf", fromTimeZone: BER, fromStopId: "8011160", fromLat: 52.5251, fromLng: 13.3694,
      toName: "Frankfurt (Main) Hbf", toTimeZone: BER, toStopId: "8000105", toLat: 50.107, toLng: 8.6631,
      departureAt: at(0, "09:51", BER), arrivalAt: at(0, "14:05", BER),
      carrier: "Deutsche Bahn", number: "ICE 597", bookingRef: "DB-7K2QX9",
      platform: "14", seat: "Car 7, seat 54", costMinor: 5990, currency: "EUR",
      notes: "Sparpreis ticket — bound to this train unless DB cancels or it is 20+ min late.",
    },
  });

  // The tight one: 11 minutes in Frankfurt Hbf, from the long-distance
  // platforms to the underground S-Bahn station.
  const sbahn = await prisma.leg.create({
    data: {
      tripId, mode: "TRAIN",
      fromName: "Frankfurt (Main) Hbf (tief)", fromTimeZone: BER, fromStopId: "8098105", fromLat: 50.107, fromLng: 8.6631,
      toName: "Frankfurt Flughafen Regionalbahnhof", toTimeZone: BER, toStopId: "8000281", toLat: 50.0513, toLng: 8.5713,
      departureAt: at(0, "14:16", BER), arrivalAt: at(0, "14:28", BER),
      carrier: "S-Bahn Rhein-Main", number: "S8", platform: "103",
      notes: "Included in the ICE ticket (City-Ticket not valid for the airport — the DB ticket covers it).",
    },
  });

  const flightOut = await prisma.leg.create({
    data: {
      tripId, mode: "FLIGHT",
      fromName: "Frankfurt Airport (FRA) T1", fromTimeZone: BER, fromStopId: "FRA", fromLat: 50.0379, fromLng: 8.5622,
      toName: "Hyderabad Airport (HYD)", toTimeZone: HYD, toStopId: "HYD", toLat: 17.2403, toLng: 78.4294,
      departureAt: at(0, "17:30", BER), arrivalAt: at(1, "07:20", HYD),
      carrier: "Lufthansa", number: "LH 752", bookingRef: "LH-5TRW8P",
      platform: "Z25", seat: "42K", costMinor: 78_400, currency: "EUR",
      notes: "Return ticket. Online check-in opens 23 h before departure.",
    },
  });

  const taxiToHotel = await prisma.leg.create({
    data: {
      tripId, mode: "TAXI",
      fromName: "Hyderabad Airport (HYD)", fromTimeZone: HYD, fromLat: 17.2403, fromLng: 78.4294,
      toName: "Novotel Hyderabad Airport", toTimeZone: HYD, toLat: 17.2287, toLng: 78.4235,
      departureAt: at(1, "08:30", HYD), arrivalAt: at(1, "08:45", HYD),
      carrier: "Hotel shuttle", notes: "Free shuttle every 30 min from Arrivals Pillar 7.",
    },
  });

  const hotel = await prisma.stay.create({
    data: {
      tripId, kind: "HOTEL",
      name: "Novotel Hyderabad Airport",
      address: "Rajiv Gandhi International Airport, Shamshabad, Hyderabad 500409",
      timeZone: HYD, lat: 17.2287, lng: 78.4235,
      checkInAt: at(1, "14:00", HYD), latestCheckInAt: at(1, "23:59", HYD), checkOutAt: at(2, "12:00", HYD),
      bookingRef: "ACC-88412907", bookingUrl: "https://all.accor.com",
      costMinor: 9_500, currency: "EUR",
      notes: "Rest day after the night flight. Early check-in requested (not confirmed).",
    },
  });

  const taxiToFamily = await prisma.leg.create({
    data: {
      tripId, mode: "TAXI",
      fromName: "Novotel Hyderabad Airport", fromTimeZone: HYD, fromLat: 17.2287, fromLng: 78.4235,
      toName: "Family home, Banjara Hills", toTimeZone: HYD, toLat: 17.4156, toLng: 78.4347,
      departureAt: at(2, "11:00", HYD), arrivalAt: at(2, "11:55", HYD),
      carrier: "Uber", costMinor: 90_000, currency: "INR",
    },
  });

  const family = await prisma.stay.create({
    data: {
      tripId, kind: "FAMILY",
      name: "Family home (Mom & Dad)",
      address: "Road No. 12, Banjara Hills, Hyderabad 500034",
      timeZone: HYD, lat: 17.4156, lng: 78.4347,
      checkInAt: at(2, "12:00", HYD), checkOutAt: at(13, "21:30", HYD),
      notes: "Dad will wait at the gate. Call when the Uber is 10 min away.",
    },
  });

  // ---------- Return ----------
  const taxiToAirport = await prisma.leg.create({
    data: {
      tripId, mode: "TAXI",
      fromName: "Family home, Banjara Hills", fromTimeZone: HYD, fromLat: 17.4156, fromLng: 78.4347,
      toName: "Hyderabad Airport (HYD)", toTimeZone: HYD, toLat: 17.2403, toLng: 78.4294,
      departureAt: at(13, "21:45", HYD), arrivalAt: at(13, "22:50", HYD),
      carrier: "Cousin's car",
    },
  });

  const flightBack = await prisma.leg.create({
    data: {
      tripId, mode: "FLIGHT",
      fromName: "Hyderabad Airport (HYD)", fromTimeZone: HYD, fromStopId: "HYD", fromLat: 17.2403, fromLng: 78.4294,
      toName: "Frankfurt Airport (FRA) T1", toTimeZone: BER, toStopId: "FRA", toLat: 50.0379, toLng: 8.5622,
      departureAt: at(14, "02:35", HYD), arrivalAt: at(14, "08:30", BER),
      carrier: "Lufthansa", number: "LH 753", bookingRef: "LH-5TRW8P", seat: "38A",
    },
  });

  const iceBack = await prisma.leg.create({
    data: {
      tripId, mode: "TRAIN",
      fromName: "Frankfurt Flughafen Fernbahnhof", fromTimeZone: BER, fromStopId: "8070003", fromLat: 50.0533, fromLng: 8.5701,
      toName: "Berlin Hbf", toTimeZone: BER, toStopId: "8011160", toLat: 52.5251, toLng: 13.3694,
      departureAt: at(14, "10:20", BER), arrivalAt: at(14, "14:44", BER),
      carrier: "Deutsche Bahn", number: "ICE 1094", bookingRef: "DB-9P4LM2", seat: "Car 12, seat 81",
      costMinor: 4_990, currency: "EUR",
    },
  });

  // ---------- Dependencies: "B needs A to finish at least N min before B starts" ----------
  const dep = (fromKind: string, fromId: string, toKind: string, toId: string, minBufferMin: number) => ({
    tripId, fromKind, fromId, toKind, toId, minBufferMin,
  });
  await prisma.dependency.createMany({
    data: [
      dep("LEG", taxiToHbf.id, "LEG", ice.id, 5),          // reach the platform
      dep("LEG", ice.id, "LEG", sbahn.id, 4),              // run down to the S-Bahn
      dep("LEG", sbahn.id, "LEG", flightOut.id, 90),       // security + passport control
      dep("LEG", flightOut.id, "LEG", taxiToHotel.id, 45), // immigration + bags
      dep("LEG", taxiToHotel.id, "STAY", hotel.id, 0),
      dep("LEG", taxiToFamily.id, "STAY", family.id, 0),
      dep("LEG", taxiToAirport.id, "LEG", flightBack.id, 120),
      dep("LEG", flightBack.id, "LEG", iceBack.id, 60),
    ],
  });

  // ---------- People & lists ----------
  const [mom, dad, nephew] = await Promise.all(
    [
      { name: "Mom", relation: "mother" },
      { name: "Dad", relation: "father" },
      { name: "Zaid", relation: "nephew" },
    ].map((p) => prisma.person.create({ data: { tripId, ...p } })),
  );

  const buyBy = (daysBeforeD0: number) => at(-daysBeforeD0, "20:00", BER);

  await prisma.task.createMany({
    data: [
      // BUY — things I still need
      { tripId, list: "BUY", name: "Ritter Sport chocolates (mixed)", quantity: 10, category: "GIFTS", status: "TO_BUY", weightG: 100, priceMinor: 149, currency: "EUR", bag: "CHECKED", buyBy: buyBy(2), notes: "For the whole family", sortOrder: 1 },
      { tripId, list: "BUY", name: "Perfume", quantity: 1, category: "GIFTS", status: "TO_BUY", personId: mom.id, weightG: 350, priceMinor: 6500, currency: "EUR", bag: "CHECKED", buyBy: buyBy(3), sortOrder: 2 },
      { tripId, list: "BUY", name: "Wrist watch", quantity: 1, category: "GIFTS", status: "BOUGHT", personId: dad.id, weightG: 200, priceMinor: 12000, currency: "EUR", bag: "CABIN", sortOrder: 3 },
      { tripId, list: "BUY", name: "Haribo Goldbären", quantity: 5, category: "FOOD", status: "TO_BUY", personId: nephew.id, weightG: 200, priceMinor: 129, currency: "EUR", bag: "CHECKED", buyBy: buyBy(1), sortOrder: 4 },
      { tripId, list: "BUY", name: "India power adapter (Type D/M)", quantity: 2, category: "ELECTRONICS", status: "TO_BUY", weightG: 80, priceMinor: 1299, currency: "EUR", bag: "CABIN", buyBy: buyBy(4), suggestionId: "IN.adapter", sortOrder: 5 },
      { tripId, list: "BUY", name: "Rupee cash (≈ €150)", quantity: 1, category: "OTHER", status: "TO_BUY", weightG: 10, bag: "CABIN", buyBy: buyBy(2), suggestionId: "IN.cash", notes: "Exchange at Reisebank or withdraw at HYD arrivals", sortOrder: 6 },
      { tripId, list: "BUY", name: "Mosquito repellent", quantity: 1, category: "MEDICINE", status: "TO_BUY", weightG: 150, priceMinor: 799, currency: "EUR", bag: "NONE", suggestionId: "IN.repellent", notes: "Cheaper in India — buy it there", placeName: "Apollo Pharmacy, Banjara Hills", timeZone: HYD, lat: 17.417, lng: 78.438, sortOrder: 7 },

      // PACK — things I already own
      { tripId, list: "PACK", name: "Passport + e-Visa printout", quantity: 1, category: "DOCUMENTS", status: "TODO", weightG: 60, bag: "CABIN", sortOrder: 1 },
      { tripId, list: "PACK", name: "Phone & laptop chargers", quantity: 1, category: "ELECTRONICS", status: "TODO", weightG: 450, bag: "CABIN", sortOrder: 2 },
      { tripId, list: "PACK", name: "Power bank (cabin only!)", quantity: 1, category: "ELECTRONICS", status: "TODO", weightG: 350, bag: "CABIN", sortOrder: 3 },
      { tripId, list: "PACK", name: "Light cotton clothes, 2 weeks", quantity: 1, category: "CLOTHES", status: "PACKED", weightG: 6500, bag: "CHECKED", sortOrder: 4 },
      { tripId, list: "PACK", name: "Toiletries kit", quantity: 1, category: "TOILETRIES", status: "TODO", weightG: 1200, bag: "CHECKED", sortOrder: 5 },
    ],
  });

  const counts = {
    legs: await prisma.leg.count(), stays: await prisma.stay.count(),
    tasks: await prisma.task.count(), dependencies: await prisma.dependency.count(),
  };
  console.log(`Seeded "${trip.name}" departing ${D0}`, counts);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
