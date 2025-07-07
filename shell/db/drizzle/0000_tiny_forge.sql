CREATE TABLE `entities` (
	`id` text NOT NULL,
	`entityType` text NOT NULL,
	`content` text NOT NULL,
	`metadata` text DEFAULT '{}' NOT NULL,
	`contentWeight` real DEFAULT 1 NOT NULL,
	`embedding` F32_BLOB(384) NOT NULL,
	`created` integer NOT NULL,
	`updated` integer NOT NULL,
	PRIMARY KEY(`entityType`, `id`)
);
--> statement-breakpoint
CREATE TABLE `job_queue` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`data` text NOT NULL,
	`result` text,
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
CREATE INDEX `idx_job_queue_type` ON `job_queue` (`type`,`status`);