INSERT INTO `ApprovalTemplate` (
    `id`, `name`, `description`, `fieldsJson`, `active`, `createdByEmail`, `updatedByEmail`, `createdAt`, `updatedAt`
) VALUES (
    'employment-certificate-request',
    '재직증명서 발급신청',
    '재직정보는 인사명부를 기준으로 확인하며 발급 용도와 제출처를 작성합니다.',
    '[{"key":"purpose","label":"발급 용도","type":"textarea","required":true},{"key":"recipient","label":"제출처","type":"text","required":true},{"key":"language","label":"발급 언어","type":"text","required":true},{"key":"copies","label":"발급 부수","type":"number","required":true},{"key":"neededBy","label":"희망 발급일","type":"date","required":false},{"key":"notes","label":"추가 요청사항","type":"textarea","required":false}]',
    true,
    'system',
    'system',
    CURRENT_TIMESTAMP(3),
    CURRENT_TIMESTAMP(3)
)
ON DUPLICATE KEY UPDATE
    `name` = VALUES(`name`),
    `description` = VALUES(`description`),
    `fieldsJson` = VALUES(`fieldsJson`),
    `active` = true,
    `updatedByEmail` = 'system',
    `updatedAt` = CURRENT_TIMESTAMP(3);
