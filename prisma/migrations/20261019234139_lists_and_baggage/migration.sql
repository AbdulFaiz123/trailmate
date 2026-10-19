-- AlterTable
ALTER TABLE "Task" ADD COLUMN "suggestionId" TEXT;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Trip" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "origin" TEXT NOT NULL,
    "destination" TEXT NOT NULL,
    "originCountry" TEXT,
    "destinationCountry" TEXT,
    "startDate" TEXT NOT NULL,
    "endDate" TEXT NOT NULL,
    "homeCurrency" TEXT NOT NULL DEFAULT 'EUR',
    "homeTimeZone" TEXT NOT NULL DEFAULT 'Europe/Berlin',
    "checkedAllowanceG" INTEGER,
    "cabinAllowanceG" INTEGER,
    "checkedTareG" INTEGER NOT NULL DEFAULT 0,
    "cabinTareG" INTEGER NOT NULL DEFAULT 0,
    "dismissedSuggestions" TEXT NOT NULL DEFAULT '[]',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Trip" ("cabinAllowanceG", "checkedAllowanceG", "createdAt", "destination", "destinationCountry", "endDate", "homeCurrency", "homeTimeZone", "id", "name", "origin", "startDate", "updatedAt") SELECT "cabinAllowanceG", "checkedAllowanceG", "createdAt", "destination", "destinationCountry", "endDate", "homeCurrency", "homeTimeZone", "id", "name", "origin", "startDate", "updatedAt" FROM "Trip";
DROP TABLE "Trip";
ALTER TABLE "new_Trip" RENAME TO "Trip";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
