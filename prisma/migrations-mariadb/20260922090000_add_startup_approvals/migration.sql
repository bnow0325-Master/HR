CREATE TABLE `ApprovalTemplate` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `description` TEXT NULL,
    `fieldsJson` TEXT NOT NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `createdByEmail` VARCHAR(191) NOT NULL,
    `updatedByEmail` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    INDEX `ApprovalTemplate_active_updatedAt_idx`(`active`, `updatedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `ApprovalDocument` (
    `id` VARCHAR(191) NOT NULL,
    `documentNo` VARCHAR(191) NOT NULL,
    `templateId` VARCHAR(191) NOT NULL,
    `templateName` VARCHAR(191) NOT NULL,
    `templateFieldsJson` TEXT NOT NULL,
    `requesterId` VARCHAR(191) NOT NULL,
    `requesterEmail` VARCHAR(191) NOT NULL,
    `requesterName` VARCHAR(191) NOT NULL,
    `requesterDepartment` VARCHAR(191) NULL,
    `title` VARCHAR(191) NOT NULL,
    `valuesJson` TEXT NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'PENDING',
    `approverEmail` VARCHAR(191) NOT NULL,
    `approverName` VARCHAR(191) NOT NULL,
    `decisionNote` TEXT NULL,
    `submittedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `decidedAt` DATETIME(3) NULL,
    `version` INTEGER NOT NULL DEFAULT 1,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    UNIQUE INDEX `ApprovalDocument_documentNo_key`(`documentNo`),
    INDEX `ApprovalDocument_requesterId_submittedAt_idx`(`requesterId`, `submittedAt`),
    INDEX `ApprovalDocument_status_submittedAt_idx`(`status`, `submittedAt`),
    INDEX `ApprovalDocument_approverEmail_status_submittedAt_idx`(`approverEmail`, `status`, `submittedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `ApprovalDocumentEvent` (
    `id` VARCHAR(191) NOT NULL,
    `documentId` VARCHAR(191) NOT NULL,
    `action` VARCHAR(191) NOT NULL,
    `fromStatus` VARCHAR(191) NULL,
    `toStatus` VARCHAR(191) NOT NULL,
    `actorEmail` VARCHAR(191) NOT NULL,
    `actorName` VARCHAR(191) NOT NULL,
    `note` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX `ApprovalDocumentEvent_documentId_createdAt_idx`(`documentId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `ApprovalDocument`
    ADD CONSTRAINT `ApprovalDocument_templateId_fkey`
    FOREIGN KEY (`templateId`) REFERENCES `ApprovalTemplate`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `ApprovalDocument`
    ADD CONSTRAINT `ApprovalDocument_requesterId_fkey`
    FOREIGN KEY (`requesterId`) REFERENCES `Employee`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `ApprovalDocumentEvent`
    ADD CONSTRAINT `ApprovalDocumentEvent_documentId_fkey`
    FOREIGN KEY (`documentId`) REFERENCES `ApprovalDocument`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO `ApprovalTemplate` (
    `id`, `name`, `description`, `fieldsJson`, `active`, `createdByEmail`, `updatedByEmail`, `createdAt`, `updatedAt`
) VALUES (
    'startup-general-proposal',
    '일반 품의서',
    '업무 진행 전에 대표이사의 승인이 필요한 내용을 자유롭게 작성합니다.',
    '[{"key":"requestDetails","label":"요청 내용","type":"textarea","required":true},{"key":"expectedEffect","label":"기대 효과","type":"textarea","required":false},{"key":"amount","label":"관련 금액","type":"number","required":false},{"key":"neededBy","label":"희망 완료일","type":"date","required":false}]',
    true,
    'system',
    'system',
    CURRENT_TIMESTAMP(3),
    CURRENT_TIMESTAMP(3)
);
