CREATE TABLE `NaverWorksAbsenceRecord` (
    `id` VARCHAR(191) NOT NULL,
    `employeeId` VARCHAR(191) NOT NULL,
    `sourceDocumentNo` VARCHAR(191) NOT NULL,
    `sourceEmployeeName` VARCHAR(191) NOT NULL,
    `sourceDepartment` VARCHAR(191) NULL,
    `absenceType` VARCHAR(191) NOT NULL,
    `unitsMinutes` INTEGER NOT NULL,
    `periodText` TEXT NOT NULL,
    `requestedOn` DATE NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'IMPORTED',
    `sourceRow` INTEGER NOT NULL,
    `importedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `NaverWorksAbsenceRecord_sourceDocumentNo_key`(`sourceDocumentNo`),
    INDEX `NaverWorksAbsenceRecord_employeeId_requestedOn_idx`(`employeeId`, `requestedOn`),
    INDEX `NaverWorksAbsenceRecord_absenceType_requestedOn_idx`(`absenceType`, `requestedOn`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `NaverWorksAbsenceRecord`
  ADD CONSTRAINT `NaverWorksAbsenceRecord_employeeId_fkey`
  FOREIGN KEY (`employeeId`) REFERENCES `Employee`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
