CREATE TABLE `runtime_state_records` (
	`namespace` text NOT NULL,
	`key` text NOT NULL,
	`value` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`namespace`, `key`)
);
--> statement-breakpoint
CREATE INDEX `idx_runtime_state_namespace_updated_at` ON `runtime_state_records` (`namespace`,`updated_at`);