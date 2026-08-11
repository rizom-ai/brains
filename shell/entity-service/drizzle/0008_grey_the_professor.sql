CREATE TABLE `entity_job_outbox` (
	`id` text PRIMARY KEY NOT NULL,
	`request` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `entity_job_outbox_delivery_order_idx` ON `entity_job_outbox` (`created_at`,`id`);