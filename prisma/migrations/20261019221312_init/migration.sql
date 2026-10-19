-- CreateTable
CREATE TABLE "Trip" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "origin" TEXT NOT NULL,
    "destination" TEXT NOT NULL,
    "destinationCountry" TEXT,
    "startDate" TEXT NOT NULL,
    "endDate" TEXT NOT NULL,
    "homeCurrency" TEXT NOT NULL DEFAULT 'EUR',
    "homeTimeZone" TEXT NOT NULL DEFAULT 'Europe/Berlin',
    "checkedAllowanceG" INTEGER,
    "cabinAllowanceG" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Leg" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tripId" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "fromName" TEXT NOT NULL,
    "fromTimeZone" TEXT NOT NULL,
    "fromLat" REAL,
    "fromLng" REAL,
    "fromStopId" TEXT,
    "toName" TEXT NOT NULL,
    "toTimeZone" TEXT NOT NULL,
    "toLat" REAL,
    "toLng" REAL,
    "toStopId" TEXT,
    "departureAt" DATETIME NOT NULL,
    "arrivalAt" DATETIME NOT NULL,
    "carrier" TEXT,
    "number" TEXT,
    "bookingRef" TEXT,
    "platform" TEXT,
    "seat" TEXT,
    "costMinor" INTEGER,
    "currency" TEXT,
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'SCHEDULED',
    "departureDelayMin" INTEGER NOT NULL DEFAULT 0,
    "arrivalDelayMin" INTEGER NOT NULL DEFAULT 0,
    "livePlatform" TEXT,
    "lastCheckedAt" DATETIME,
    "simulated" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Leg_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Stay" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tripId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "timeZone" TEXT NOT NULL,
    "lat" REAL,
    "lng" REAL,
    "checkInAt" DATETIME NOT NULL,
    "latestCheckInAt" DATETIME,
    "checkOutAt" DATETIME NOT NULL,
    "bookingRef" TEXT,
    "bookingUrl" TEXT,
    "costMinor" INTEGER,
    "currency" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Stay_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Task" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tripId" TEXT NOT NULL,
    "list" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "category" TEXT,
    "status" TEXT NOT NULL DEFAULT 'TODO',
    "personId" TEXT,
    "weightG" INTEGER,
    "priceMinor" INTEGER,
    "currency" TEXT,
    "bag" TEXT,
    "buyBy" DATETIME,
    "dueAt" DATETIME,
    "placeName" TEXT,
    "timeZone" TEXT,
    "lat" REAL,
    "lng" REAL,
    "notes" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Task_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Task_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Person" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tripId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "relation" TEXT,
    CONSTRAINT "Person_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tripId" TEXT NOT NULL,
    "itemKind" TEXT,
    "itemId" TEXT,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "storagePath" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Document_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Dependency" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tripId" TEXT NOT NULL,
    "fromKind" TEXT NOT NULL,
    "fromId" TEXT NOT NULL,
    "toKind" TEXT NOT NULL,
    "toId" TEXT NOT NULL,
    "minBufferMin" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "Dependency_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Alert" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tripId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "action" TEXT,
    "itemKind" TEXT,
    "itemId" TEXT,
    "dedupeKey" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readAt" DATETIME,
    "pushedAt" DATETIME,
    CONSTRAINT "Alert_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Settings" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'me',
    "homeTimeZone" TEXT NOT NULL DEFAULT 'Europe/Berlin',
    "leaveBufferMin" INTEGER NOT NULL DEFAULT 20,
    "quietHoursStart" TEXT,
    "quietHoursEnd" TEXT,
    "alertDelay" BOOLEAN NOT NULL DEFAULT true,
    "alertConnection" BOOLEAN NOT NULL DEFAULT true,
    "alertBuyBy" BOOLEAN NOT NULL DEFAULT true,
    "alertPacking" BOOLEAN NOT NULL DEFAULT true,
    "alertLeaveNow" BOOLEAN NOT NULL DEFAULT true,
    "alertCheckIn" BOOLEAN NOT NULL DEFAULT true,
    "alertNearbyShop" BOOLEAN NOT NULL DEFAULT true
);

-- CreateTable
CREATE TABLE "PushSubscription" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "Leg_tripId_departureAt_idx" ON "Leg"("tripId", "departureAt");

-- CreateIndex
CREATE INDEX "Stay_tripId_checkInAt_idx" ON "Stay"("tripId", "checkInAt");

-- CreateIndex
CREATE INDEX "Task_tripId_list_idx" ON "Task"("tripId", "list");

-- CreateIndex
CREATE INDEX "Dependency_tripId_idx" ON "Dependency"("tripId");

-- CreateIndex
CREATE UNIQUE INDEX "Dependency_fromKind_fromId_toKind_toId_key" ON "Dependency"("fromKind", "fromId", "toKind", "toId");

-- CreateIndex
CREATE UNIQUE INDEX "Alert_dedupeKey_key" ON "Alert"("dedupeKey");

-- CreateIndex
CREATE UNIQUE INDEX "PushSubscription_endpoint_key" ON "PushSubscription"("endpoint");
