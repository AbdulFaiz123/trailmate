-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Task" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tripId" TEXT NOT NULL,
    "list" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "category" TEXT,
    "status" TEXT NOT NULL DEFAULT 'TODO',
    "statusChangedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
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
    "suggestionId" TEXT,
    "clientId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Task_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Task_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
-- We don't know when existing statuses last changed; createdAt is the earliest it could have been.
INSERT INTO "new_Task" ("statusChangedAt", "bag", "buyBy", "category", "clientId", "createdAt", "currency", "dueAt", "id", "lat", "list", "lng", "name", "notes", "personId", "placeName", "priceMinor", "quantity", "sortOrder", "status", "suggestionId", "timeZone", "tripId", "updatedAt", "weightG") SELECT "createdAt", "bag", "buyBy", "category", "clientId", "createdAt", "currency", "dueAt", "id", "lat", "list", "lng", "name", "notes", "personId", "placeName", "priceMinor", "quantity", "sortOrder", "status", "suggestionId", "timeZone", "tripId", "updatedAt", "weightG" FROM "Task";
DROP TABLE "Task";
ALTER TABLE "new_Task" RENAME TO "Task";
CREATE UNIQUE INDEX "Task_clientId_key" ON "Task"("clientId");
CREATE INDEX "Task_tripId_list_idx" ON "Task"("tripId", "list");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

