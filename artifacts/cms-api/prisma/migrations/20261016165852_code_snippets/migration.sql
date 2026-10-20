-- CreateTable
CREATE TABLE `Snippet` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `description` VARCHAR(400) NOT NULL DEFAULT '',
    `language` VARCHAR(10) NOT NULL,
    `code` MEDIUMTEXT NOT NULL,
    `location` VARCHAR(20) NOT NULL DEFAULT 'head',
    `scope` VARCHAR(20) NOT NULL DEFAULT 'everywhere',
    `paths` JSON NULL,
    `tags` JSON NULL,
    `priority` INTEGER NOT NULL DEFAULT 10,
    `active` BOOLEAN NOT NULL DEFAULT false,
    `createdById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Snippet_active_location_idx`(`active`, `location`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
