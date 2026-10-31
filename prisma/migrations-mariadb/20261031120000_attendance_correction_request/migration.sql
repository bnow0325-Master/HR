CREATE TABLE `AttendanceCorrectionRequest` (
  `id` VARCHAR(191) NOT NULL,
  `employeeId` VARCHAR(191) NOT NULL,
  `workDate` DATE NOT NULL,
  `pendingWorkDate` DATE NULL,
  `checkInAt` DATETIME(3) NULL,
  `checkOutAt` DATETIME(3) NULL,
  `reason` TEXT NOT NULL,
  `status` VARCHAR(191) NOT NULL DEFAULT 'PENDING',
  `reviewerNote` TEXT NULL,
  `reviewedAt` DATETIME(3) NULL,
  `reviewedByEmail` VARCHAR(191) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  INDEX `AttendanceCorrectionRequest_employeeId_workDate_idx` (`employeeId`, `workDate`),
  UNIQUE INDEX `AttendanceCorrectionRequest_employeeId_pendingWorkDate_key` (`employeeId`, `pendingWorkDate`),
  INDEX `AttendanceCorrectionRequest_status_createdAt_idx` (`status`, `createdAt`),
  PRIMARY KEY (`id`),
  CONSTRAINT `AttendanceCorrectionRequest_employeeId_fkey`
    FOREIGN KEY (`employeeId`) REFERENCES `Employee`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
