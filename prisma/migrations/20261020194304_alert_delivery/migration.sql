-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Alert" (
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
    "urgent" BOOLEAN NOT NULL DEFAULT false,
    "url" TEXT,
    "fireAt" DATETIME,
    "expiresAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readAt" DATETIME,
    "pushedAt" DATETIME,
    CONSTRAINT "Alert_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Alert" ("action", "body", "createdAt", "dedupeKey", "id", "itemId", "itemKind", "pushedAt", "readAt", "severity", "title", "tripId", "type") SELECT "action", "body", "createdAt", "dedupeKey", "id", "itemId", "itemKind", "pushedAt", "readAt", "severity", "title", "tripId", "type" FROM "Alert";
DROP TABLE "Alert";
ALTER TABLE "new_Alert" RENAME TO "Alert";
CREATE UNIQUE INDEX "Alert_dedupeKey_key" ON "Alert"("dedupeKey");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
