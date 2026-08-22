-- Add NAVER WORKS login mapping to employees.
ALTER TABLE "Employee" ADD COLUMN "externalLoginId" TEXT;

CREATE UNIQUE INDEX "Employee_externalLoginId_key" ON "Employee"("externalLoginId");

-- Store imported NAVER WORKS commuteList.xlsx rows as daily attendance summaries.
CREATE TABLE "NaverWorksDailyRecord" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "baseDate" DATE NOT NULL,
    "workStyle" TEXT,
    "workType" TEXT,
    "schedule" TEXT,
    "checkInAt" TIMESTAMP(3),
    "checkOutAt" TIMESTAMP(3),
    "checkInRaw" TEXT,
    "checkOutRaw" TEXT,
    "workLocation" TEXT,
    "breakMinutes" INTEGER NOT NULL DEFAULT 0,
    "offsiteMinutes" INTEGER NOT NULL DEFAULT 0,
    "absenceMinutes" INTEGER NOT NULL DEFAULT 0,
    "late" BOOLEAN NOT NULL DEFAULT false,
    "earlyLeave" BOOLEAN NOT NULL DEFAULT false,
    "requiredWorkCompliant" TEXT,
    "scheduleCompliant" TEXT,
    "scheduleVariance" TEXT,
    "sourceLoginId" TEXT NOT NULL,
    "sourceRow" INTEGER NOT NULL,
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NaverWorksDailyRecord_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "NaverWorksDailyRecord_employeeId_baseDate_key"
    ON "NaverWorksDailyRecord"("employeeId", "baseDate");

CREATE INDEX "NaverWorksDailyRecord_baseDate_idx"
    ON "NaverWorksDailyRecord"("baseDate");

CREATE INDEX "NaverWorksDailyRecord_sourceLoginId_idx"
    ON "NaverWorksDailyRecord"("sourceLoginId");

ALTER TABLE "NaverWorksDailyRecord"
    ADD CONSTRAINT "NaverWorksDailyRecord_employeeId_fkey"
    FOREIGN KEY ("employeeId") REFERENCES "Employee"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
