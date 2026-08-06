ALTER TABLE "AttendanceRecord"
ADD COLUMN "cancelledAt" TIMESTAMP(3),
ADD COLUMN "cancelNote" TEXT;

CREATE INDEX "AttendanceRecord_employeeId_cancelledAt_timestamp_idx"
ON "AttendanceRecord"("employeeId", "cancelledAt", "timestamp");
