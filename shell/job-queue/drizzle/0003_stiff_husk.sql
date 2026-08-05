ALTER TABLE `job_queue` ADD `progress` text;--> statement-breakpoint
ALTER TABLE `job_queue` ADD `runtimeUpdatedAt` integer;--> statement-breakpoint
CREATE INDEX `idx_job_queue_runtime_updates` ON `job_queue` (`runtimeUpdatedAt`,`id`);