ALTER TABLE `job_queue` ADD `brainVersion` text;--> statement-breakpoint
ALTER TABLE `job_queue` ADD `brainVersionSortKey` text;--> statement-breakpoint
ALTER TABLE `job_worker_sessions` ADD `brainVersion` text;--> statement-breakpoint
ALTER TABLE `job_worker_sessions` ADD `brainVersionSortKey` text;