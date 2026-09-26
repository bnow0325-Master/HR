CREATE TABLE `ApprovalAudit` (
    `id` VARCHAR(191) NOT NULL,
    `employeeId` VARCHAR(191) NOT NULL,
    `requestKind` VARCHAR(191) NOT NULL,
    `requestId` VARCHAR(191) NOT NULL,
    `action` VARCHAR(191) NOT NULL,
    `fromStatus` VARCHAR(191) NULL,
    `toStatus` VARCHAR(191) NOT NULL,
    `actorEmail` VARCHAR(191) NULL,
    `actorName` VARCHAR(191) NOT NULL,
    `note` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX `ApprovalAudit_requestKind_requestId_createdAt_idx`(`requestKind`, `requestId`, `createdAt`),
    INDEX `ApprovalAudit_employeeId_createdAt_idx`(`employeeId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `ApprovalAudit`
    ADD CONSTRAINT `ApprovalAudit_employeeId_fkey`
    FOREIGN KEY (`employeeId`) REFERENCES `Employee`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE;
