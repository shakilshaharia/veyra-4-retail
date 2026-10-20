-- CreateTable
CREATE TABLE `NotFoundLog` (
    `id` VARCHAR(191) NOT NULL,
    `path` VARCHAR(500) NOT NULL,
    `hits` INTEGER NOT NULL DEFAULT 1,
    `userAgent` VARCHAR(300) NOT NULL DEFAULT '',
    `referrer` VARCHAR(500) NOT NULL DEFAULT '',
    `resolved` BOOLEAN NOT NULL DEFAULT false,
    `lastHitAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `NotFoundLog_path_key`(`path`),
    INDEX `NotFoundLog_lastHitAt_idx`(`lastHitAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
