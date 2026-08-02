CREATE TABLE `job_worker_sessions` (
	`slotId` text PRIMARY KEY NOT NULL,
	`sessionId` text NOT NULL,
	`startedAt` integer NOT NULL,
	`heartbeatAt` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `job_worker_sessions_sessionId_unique` ON `job_worker_sessions` (`sessionId`);--> statement-breakpoint
CREATE INDEX `idx_job_worker_sessions_heartbeat` ON `job_worker_sessions` (`heartbeatAt`);--> statement-breakpoint
ALTER TABLE `job_queue` ADD `attemptId` text;--> statement-breakpoint
ALTER TABLE `job_queue` ADD `workerSlotId` text;--> statement-breakpoint
ALTER TABLE `job_queue` ADD `workerSessionId` text;--> statement-breakpoint
ALTER TABLE `job_queue` ADD `leaseExpiresAt` integer;--> statement-breakpoint
ALTER TABLE `job_queue` ADD `attemptHeartbeatAt` integer;