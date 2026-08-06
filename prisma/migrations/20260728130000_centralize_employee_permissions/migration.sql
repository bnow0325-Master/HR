ALTER TABLE "Employee"
ADD COLUMN "phone" TEXT,
ADD COLUMN "terminationDate" TIMESTAMP(3),
ADD COLUMN "systemRole" TEXT NOT NULL DEFAULT 'MEMBER',
ADD COLUMN "attendanceEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "leaveEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "workboardEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE "Employee"
SET
  "attendanceEnabled" = false,
  "leaveEnabled" = false,
  "workboardEnabled" = false
WHERE "active" = false;

UPDATE "Employee"
SET "workboardEnabled" = true
WHERE "active" = true AND "email" IS NOT NULL;

CREATE INDEX "Employee_active_code_idx"
ON "Employee"("active", "code");

CREATE UNIQUE INDEX "Employee_email_key"
ON "Employee"("email");
