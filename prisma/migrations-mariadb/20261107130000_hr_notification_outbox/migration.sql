-- Active MariaDB migration directory is configured in prisma.config.ts.
CREATE TABLE `HrNotificationOutbox` (
  `id` VARCHAR(191) NOT NULL,
  `idempotencyKey` VARCHAR(190) NOT NULL,
  `recipientEmail` VARCHAR(320) NOT NULL,
  `audience` VARCHAR(20) NOT NULL,
  `senderName` VARCHAR(80) NOT NULL,
  `title` VARCHAR(200) NOT NULL,
  `message` TEXT NOT NULL,
  `status` VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  `attempts` INTEGER NOT NULL DEFAULT 0,
  `nextAttemptAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `sentAt` DATETIME(3) NULL,
  `remoteRoomId` VARCHAR(36) NULL,
  `remoteMessageSeq` INTEGER NULL,
  `lastError` VARCHAR(200) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `HrNotificationOutbox_idempotencyKey_key` (`idempotencyKey`),
  INDEX `HrNotificationOutbox_status_nextAttemptAt_idx` (`status`, `nextAttemptAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
