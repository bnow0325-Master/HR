-- Store HR-only contact details without changing existing employee records.
ALTER TABLE "Employee"
ADD COLUMN "personalEmail" TEXT,
ADD COLUMN "homeAddress" TEXT,
ADD COLUMN "emergencyContactPhone" TEXT;

CREATE UNIQUE INDEX "Employee_personalEmail_key"
ON "Employee"("personalEmail");
