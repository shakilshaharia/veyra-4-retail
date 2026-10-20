-- AlterTable
ALTER TABLE `user` ADD COLUMN `emailOtpAttempts` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `emailOtpCodeHash` VARCHAR(191) NULL,
    ADD COLUMN `emailOtpEnabled` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `emailOtpExpiresAt` DATETIME(3) NULL;
