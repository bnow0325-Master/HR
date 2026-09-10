-- New leave and business-trip requests require an HR administrator decision.
ALTER TABLE `LeaveRequest`
    ADD COLUMN `reviewedByEmail` VARCHAR(191) NULL;

ALTER TABLE `BusinessTrip`
    ADD COLUMN `reviewerNote` TEXT NULL,
    ADD COLUMN `reviewedAt` DATETIME(3) NULL,
    ADD COLUMN `reviewedByEmail` VARCHAR(191) NULL;

-- Trips created before the approval workflow were already treated as confirmed.
UPDATE `BusinessTrip`
SET `status` = 'APPROVED'
WHERE `status` = 'REGISTERED';

ALTER TABLE `BusinessTrip`
    MODIFY `status` VARCHAR(191) NOT NULL DEFAULT 'PENDING';
