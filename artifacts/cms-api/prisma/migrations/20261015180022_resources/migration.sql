-- AlterTable
ALTER TABLE `post` ADD COLUMN `details` JSON NULL,
    ADD COLUMN `featured` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `solutions` JSON NULL,
    ADD COLUMN `type` ENUM('BLOG', 'USE_CASE', 'EVENT') NOT NULL DEFAULT 'BLOG';

-- CreateIndex
CREATE INDEX `Post_type_status_idx` ON `Post`(`type`, `status`);
