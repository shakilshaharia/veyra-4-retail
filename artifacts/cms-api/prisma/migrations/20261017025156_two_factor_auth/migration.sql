-- AlterTable
ALTER TABLE `user` ADD COLUMN `backupCodes` JSON NULL,
    ADD COLUMN `totpEnabledAt` DATETIME(3) NULL,
    ADD COLUMN `totpSecret` VARCHAR(255) NULL;
