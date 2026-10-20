-- AlterTable
ALTER TABLE "Task" ADD COLUMN "clientId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Task_clientId_key" ON "Task"("clientId");

