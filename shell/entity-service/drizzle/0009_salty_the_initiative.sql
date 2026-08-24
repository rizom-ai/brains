CREATE TABLE `entity_export_intents` (
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`operation` text NOT NULL,
	`revision` text NOT NULL,
	`marked_at` integer NOT NULL,
	PRIMARY KEY(`entity_type`, `entity_id`)
);
--> statement-breakpoint
CREATE INDEX `entity_export_intents_marked_at_idx` ON `entity_export_intents` (`marked_at`);