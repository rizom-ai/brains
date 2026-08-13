ALTER TABLE `job_worker_sessions` ADD `expiresAt` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX `idx_job_worker_sessions_expires` ON `job_worker_sessions` (`expiresAt`);