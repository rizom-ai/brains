ALTER TABLE job_queue ADD `source` text;--> statement-breakpoint
ALTER TABLE job_queue ADD `metadata` text;--> statement-breakpoint
CREATE INDEX `idx_job_queue_source` ON `job_queue` (`source`);