CREATE TABLE `NaverWorksAbsenceRecord` (
    `id` VARCHAR(191) NOT NULL,
    `employeeId` VARCHAR(191) NOT NULL,
    `sourceDocumentNo` VARCHAR(191) NOT NULL,
    `absenceType` VARCHAR(191) NOT NULL,
    `unitsDays` DECIMAL(5, 2) NOT NULL,
    `startDate` DATE NOT NULL,
    `endDate` DATE NOT NULL,
    `timeDetail` TEXT NULL,
    `sourceDepartment` TEXT NULL,
    `submittedOn` DATE NULL,
    `cancelled` BOOLEAN NOT NULL DEFAULT false,
    `sourceSystem` VARCHAR(191) NOT NULL DEFAULT 'NAVER_WORKS',
    `importedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `NaverWorksAbsenceRecord_sourceDocumentNo_key`(`sourceDocumentNo`),
    INDEX `NaverWorksAbsenceRecord_employeeId_startDate_idx`(`employeeId`, `startDate`),
    INDEX `NaverWorksAbsenceRecord_absenceType_startDate_idx`(`absenceType`, `startDate`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `NaverWorksAbsenceRecord`
    ADD CONSTRAINT `NaverWorksAbsenceRecord_employeeId_fkey`
    FOREIGN KEY (`employeeId`) REFERENCES `Employee`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE;
