CREATE TABLE `job_queue` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`data` text NOT NULL,
	`result` text,
	`source` text,
	`metadata` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`priority` integer DEFAULT 0 NOT NULL,
	`retryCount` integer DEFAULT 0 NOT NULL,
	`maxRetries` integer DEFAULT 3 NOT NULL,
	`lastError` text,
	`createdAt` integer NOT NULL,
	`scheduledFor` integer NOT NULL,
	`startedAt` integer,
	`completedAt` integer
);
--> statement-breakpoint
CREATE INDEX `idx_job_queue_ready` ON `job_queue` (`status`,`priority`,`scheduledFor`);--> statement-breakpoint
CREATE INDEX `idx_job_queue_type` ON `job_queue` (`type`,`status`);--> statement-breakpoint
CREATE INDEX `idx_job_queue_source` ON `job_queue` (`source`);