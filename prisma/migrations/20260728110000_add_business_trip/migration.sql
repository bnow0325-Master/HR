CREATE TABLE "BusinessTrip" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'REGISTERED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BusinessTrip_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "BusinessTrip_employeeId_startDate_endDate_idx"
ON "BusinessTrip"("employeeId", "startDate", "endDate");

CREATE INDEX "BusinessTrip_status_startDate_idx"
ON "BusinessTrip"("status", "startDate");

ALTER TABLE "BusinessTrip"
ADD CONSTRAINT "BusinessTrip_employeeId_fkey"
FOREIGN KEY ("employeeId") REFERENCES "Employee"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
