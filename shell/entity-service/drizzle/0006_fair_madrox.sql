CREATE TABLE `projection_incidents` (
	`wave_id` text PRIMARY KEY NOT NULL,
	`rule_id` text NOT NULL,
	`job_id` text,
	`failure_reason` text NOT NULL,
	`created_at` integer NOT NULL,
	`resolved_at` integer,
	FOREIGN KEY (`wave_id`) REFERENCES `projection_waves`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `projection_incidents_unresolved_idx` ON `projection_incidents` (`resolved_at`,`created_at`);