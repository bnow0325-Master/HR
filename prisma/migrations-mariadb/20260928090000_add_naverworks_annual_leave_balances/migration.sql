CREATE TABLE `NaverWorksAnnualLeaveBalance` (
    `id` VARCHAR(191) NOT NULL,
    `employeeId` VARCHAR(191) NOT NULL,
    `sourceYear` INTEGER NOT NULL,
    `sourceGroup` VARCHAR(191) NULL,
    `sourceLoginId` VARCHAR(191) NULL,
    `sourceDepartment` VARCHAR(191) NULL,
    `cycleStart` DATE NOT NULL,
    `cycleEnd` DATE NOT NULL,
    `annualGrantedMinutes` INTEGER NOT NULL DEFAULT 0,
    `firstYearGrantedMinutes` INTEGER NOT NULL DEFAULT 0,
    `firstYearCarryoverMinutes` INTEGER NOT NULL DEFAULT 0,
    `carryoverMinutes` INTEGER NOT NULL DEFAULT 0,
    `usedMinutes` INTEGER NOT NULL DEFAULT 0,
    `adjustedMinutes` INTEGER NOT NULL DEFAULT 0,
    `remainingMinutes` INTEGER NOT NULL DEFAULT 0,
    `sourceAsOf` DATE NOT NULL,
    `sourceRow` INTEGER NOT NULL,
    `importedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Nwab_employee_year_cycle_uq`(`employeeId`, `sourceYear`, `cycleStart`),
    INDEX `Nwab_employee_cycle_idx`(`employeeId`, `cycleStart`, `cycleEnd`),
    INDEX `Nwab_year_idx`(`sourceYear`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `NaverWorksAnnualLeaveBalance`
    ADD CONSTRAINT `NaverWorksAnnualLeaveBalance_employeeId_fkey`
    FOREIGN KEY (`employeeId`) REFERENCES `Employee`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
