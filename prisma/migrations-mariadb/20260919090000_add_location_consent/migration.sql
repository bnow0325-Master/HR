-- 출퇴근 위치 기록은 직원이 안내 내용을 확인하고 동의한 경우에만 저장한다.
ALTER TABLE `Employee`
    ADD COLUMN `locationConsentAt` DATETIME(3) NULL,
    ADD COLUMN `locationConsentVersion` VARCHAR(191) NULL;
