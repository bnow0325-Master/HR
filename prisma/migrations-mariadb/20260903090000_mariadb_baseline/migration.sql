-- HR 전용 MariaDB 초기 스키마. 기존 PostgreSQL 마이그레이션은 prisma/migrations에 보존한다.
CREATE TABLE `Employee` (
    `id` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `department` VARCHAR(191) NULL,
    `position` VARCHAR(191) NULL,
    `email` VARCHAR(191) NULL,
    `externalLoginId` VARCHAR(191) NULL,
    `phone` VARCHAR(191) NULL,
    `personalEmail` VARCHAR(191) NULL,
    `homeAddress` TEXT NULL,
    `emergencyContactPhone` VARCHAR(191) NULL,
    `profilePhotoData` LONGBLOB NULL,
    `profilePhotoMimeType` VARCHAR(191) NULL,
    `profilePhotoUpdatedAt` DATETIME(3) NULL,
    `hireDate` DATETIME(3) NULL,
    `terminationDate` DATETIME(3) NULL,
    `workMinutesPerDay` INTEGER NOT NULL DEFAULT 480,
    `systemRole` VARCHAR(191) NOT NULL DEFAULT 'MEMBER',
    `attendanceEnabled` BOOLEAN NOT NULL DEFAULT true,
    `leaveEnabled` BOOLEAN NOT NULL DEFAULT true,
    `workboardEnabled` BOOLEAN NOT NULL DEFAULT false,
    `pinHash` VARCHAR(191) NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    UNIQUE INDEX `Employee_code_key`(`code`),
    UNIQUE INDEX `Employee_email_key`(`email`),
    UNIQUE INDEX `Employee_externalLoginId_key`(`externalLoginId`),
    UNIQUE INDEX `Employee_personalEmail_key`(`personalEmail`),
    INDEX `Employee_active_code_idx`(`active`, `code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `NaverWorksDailyRecord` (
    `id` VARCHAR(191) NOT NULL,
    `employeeId` VARCHAR(191) NOT NULL,
    `baseDate` DATE NOT NULL,
    `workStyle` VARCHAR(191) NULL,
    `workType` VARCHAR(191) NULL,
    `schedule` TEXT NULL,
    `checkInAt` DATETIME(3) NULL,
    `checkOutAt` DATETIME(3) NULL,
    `checkInRaw` TEXT NULL,
    `checkOutRaw` TEXT NULL,
    `workLocation` TEXT NULL,
    `breakMinutes` INTEGER NOT NULL DEFAULT 0,
    `offsiteMinutes` INTEGER NOT NULL DEFAULT 0,
    `absenceMinutes` INTEGER NOT NULL DEFAULT 0,
    `late` BOOLEAN NOT NULL DEFAULT false,
    `earlyLeave` BOOLEAN NOT NULL DEFAULT false,
    `requiredWorkCompliant` TEXT NULL,
    `scheduleCompliant` TEXT NULL,
    `scheduleVariance` TEXT NULL,
    `sourceLoginId` VARCHAR(191) NOT NULL,
    `sourceRow` INTEGER NOT NULL,
    `importedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    INDEX `NaverWorksDailyRecord_baseDate_idx`(`baseDate`),
    INDEX `NaverWorksDailyRecord_sourceLoginId_idx`(`sourceLoginId`),
    UNIQUE INDEX `NaverWorksDailyRecord_employeeId_baseDate_key`(`employeeId`, `baseDate`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `AttendanceRecord` (
    `id` VARCHAR(191) NOT NULL,
    `employeeId` VARCHAR(191) NOT NULL,
    `type` VARCHAR(191) NOT NULL,
    `timestamp` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `method` VARCHAR(191) NOT NULL DEFAULT 'MANUAL',
    `verified` BOOLEAN NOT NULL DEFAULT false,
    `latitude` DOUBLE NULL,
    `longitude` DOUBLE NULL,
    `note` TEXT NULL,
    `cancelledAt` DATETIME(3) NULL,
    `cancelNote` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX `AttendanceRecord_employeeId_timestamp_idx`(`employeeId`, `timestamp`),
    INDEX `AttendanceRecord_employeeId_cancelledAt_timestamp_idx`(`employeeId`, `cancelledAt`, `timestamp`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `LeaveRequest` (
    `id` VARCHAR(191) NOT NULL,
    `employeeId` VARCHAR(191) NOT NULL,
    `leaveType` VARCHAR(191) NOT NULL,
    `leaveDate` DATETIME(3) NOT NULL,
    `unitsMinutes` INTEGER NOT NULL,
    `reason` TEXT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'PENDING',
    `reviewerNote` TEXT NULL,
    `reviewedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    INDEX `LeaveRequest_employeeId_leaveDate_idx`(`employeeId`, `leaveDate`),
    INDEX `LeaveRequest_status_leaveDate_idx`(`status`, `leaveDate`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `BusinessTrip` (
    `id` VARCHAR(191) NOT NULL,
    `employeeId` VARCHAR(191) NOT NULL,
    `startDate` DATETIME(3) NOT NULL,
    `endDate` DATETIME(3) NOT NULL,
    `reason` TEXT NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'REGISTERED',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    INDEX `BusinessTrip_employeeId_startDate_endDate_idx`(`employeeId`, `startDate`, `endDate`),
    INDEX `BusinessTrip_status_startDate_idx`(`status`, `startDate`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `NaverWorksDailyRecord` ADD CONSTRAINT `NaverWorksDailyRecord_employeeId_fkey` FOREIGN KEY (`employeeId`) REFERENCES `Employee`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `AttendanceRecord` ADD CONSTRAINT `AttendanceRecord_employeeId_fkey` FOREIGN KEY (`employeeId`) REFERENCES `Employee`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `LeaveRequest` ADD CONSTRAINT `LeaveRequest_employeeId_fkey` FOREIGN KEY (`employeeId`) REFERENCES `Employee`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `BusinessTrip` ADD CONSTRAINT `BusinessTrip_employeeId_fkey` FOREIGN KEY (`employeeId`) REFERENCES `Employee`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
