CREATE TABLE `SpecialLeaveGrant` (
  `id` VARCHAR(191) NOT NULL,
  `employeeId` VARCHAR(191) NOT NULL,
  `sourceWorkDate` DATE NOT NULL,
  `unitsMinutes` INTEGER NOT NULL,
  `reason` TEXT NOT NULL,
  `grantedByEmail` VARCHAR(191) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `SpecialLeaveGrant_employeeId_sourceWorkDate_key` (`employeeId`, `sourceWorkDate`),
  INDEX `SpecialLeaveGrant_employeeId_createdAt_idx` (`employeeId`, `createdAt`),
  PRIMARY KEY (`id`),
  CONSTRAINT `SpecialLeaveGrant_employeeId_fkey` FOREIGN KEY (`employeeId`) REFERENCES `Employee`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
