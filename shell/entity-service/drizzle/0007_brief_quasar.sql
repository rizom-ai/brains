CREATE TABLE `projection_admission_state` (
	`id` integer PRIMARY KEY NOT NULL,
	`epoch` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `projection_batch_children` (
	`batch_id` text NOT NULL,
	`child_key` text NOT NULL,
	`job_id` text,
	`status` text DEFAULT 'expected' NOT NULL,
	`terminal_at` integer,
	PRIMARY KEY(`batch_id`, `child_key`),
	FOREIGN KEY (`batch_id`) REFERENCES `projection_batches`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `projection_batch_children_job_idx` ON `projection_batch_children` (`job_id`);--> statement-breakpoint
CREATE INDEX `projection_batch_children_status_idx` ON `projection_batch_children` (`batch_id`,`status`);--> statement-breakpoint
CREATE TABLE `projection_batches` (
	`id` text PRIMARY KEY NOT NULL,
	`source` text NOT NULL,
	`operation_id` text NOT NULL,
	`status` text NOT NULL,
	`owner_kind` text NOT NULL,
	`owner_token` text NOT NULL,
	`root_job_id` text,
	`expected_children` integer DEFAULT 0 NOT NULL,
	`enqueue_complete` integer DEFAULT 0 NOT NULL,
	`enqueue_failed` integer DEFAULT 0 NOT NULL,
	`opened_at` integer NOT NULL,
	`last_progress_at` integer NOT NULL,
	`lease_expires_at` integer,
	`terminal_at` integer,
	`recovered_at` integer,
	`first_generation` integer,
	`highest_generation` integer,
	`mutation_count` integer DEFAULT 0 NOT NULL,
	`recovery_generation` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `projection_batches_operation_idx` ON `projection_batches` (`source`,`operation_id`);--> statement-breakpoint
CREATE INDEX `projection_batches_admission_idx` ON `projection_batches` (`status`,`opened_at`);--> statement-breakpoint
CREATE INDEX `projection_batches_root_job_idx` ON `projection_batches` (`root_job_id`);--> statement-breakpoint
CREATE INDEX `projection_batches_recovery_idx` ON `projection_batches` (`recovered_at`,`recovery_generation`);--> statement-breakpoint
ALTER TABLE `projection_waves` ADD `admission_epoch` integer DEFAULT 0 NOT NULL;