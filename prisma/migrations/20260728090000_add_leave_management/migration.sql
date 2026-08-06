ALTER TABLE "Employee"
ADD COLUMN "position" TEXT,
ADD COLUMN "email" TEXT,
ADD COLUMN "hireDate" TIMESTAMP(3),
ADD COLUMN "workMinutesPerDay" INTEGER NOT NULL DEFAULT 480;

CREATE TABLE "LeaveRequest" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "leaveType" TEXT NOT NULL,
    "leaveDate" TIMESTAMP(3) NOT NULL,
    "unitsMinutes" INTEGER NOT NULL,
    "reason" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "reviewerNote" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeaveRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "LeaveRequest_employeeId_leaveDate_idx"
ON "LeaveRequest"("employeeId", "leaveDate");

CREATE INDEX "LeaveRequest_status_leaveDate_idx"
ON "LeaveRequest"("status", "leaveDate");

ALTER TABLE "LeaveRequest"
ADD CONSTRAINT "LeaveRequest_employeeId_fkey"
FOREIGN KEY ("employeeId") REFERENCES "Employee"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
