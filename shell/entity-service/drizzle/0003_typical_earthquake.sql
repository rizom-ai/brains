CREATE TABLE `projection_dirty_inputs` (
	`generation` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`kind` text NOT NULL,
	`source_type` text NOT NULL,
	`source_id` text NOT NULL,
	`revision` text NOT NULL,
	`operation` text NOT NULL,
	`marked_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `projection_dirty_inputs_generation_idx` ON `projection_dirty_inputs` (`generation`);--> statement-breakpoint
CREATE TABLE `projection_rule_memos` (
	`rule_id` text NOT NULL,
	`rule_version` text NOT NULL,
	`input_fingerprint` text NOT NULL,
	`write_intents` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`rule_id`, `rule_version`, `input_fingerprint`)
);
--> statement-breakpoint
CREATE TABLE `projection_wave_inputs` (
	`wave_id` text NOT NULL,
	`kind` text NOT NULL,
	`source_type` text NOT NULL,
	`source_id` text NOT NULL,
	`revision` text NOT NULL,
	`operation` text NOT NULL,
	`generation` integer NOT NULL,
	PRIMARY KEY(`wave_id`, `kind`, `source_type`, `source_id`),
	FOREIGN KEY (`wave_id`) REFERENCES `projection_waves`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `projection_wave_inputs_generation_idx` ON `projection_wave_inputs` (`wave_id`,`generation`);--> statement-breakpoint
CREATE TABLE `projection_wave_rules` (
	`wave_id` text NOT NULL,
	`rule_id` text NOT NULL,
	`target_type` text NOT NULL,
	`level` integer NOT NULL,
	`job_id` text,
	`status` text NOT NULL,
	`input_fingerprint` text,
	`changed_targets` text DEFAULT '[]' NOT NULL,
	PRIMARY KEY(`wave_id`, `rule_id`),
	FOREIGN KEY (`wave_id`) REFERENCES `projection_waves`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `projection_wave_rules_status_idx` ON `projection_wave_rules` (`wave_id`,`status`,`level`);--> statement-breakpoint
CREATE TABLE `projection_waves` (
	`id` text PRIMARY KEY NOT NULL,
	`cutoff_generation` integer NOT NULL,
	`graph_fingerprint` text NOT NULL,
	`status` text NOT NULL,
	`started_at` integer NOT NULL,
	`completed_at` integer
);
