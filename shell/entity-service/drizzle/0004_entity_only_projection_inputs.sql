PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_projection_wave_inputs` (
	`wave_id` text NOT NULL,
	`source_type` text NOT NULL,
	`source_id` text NOT NULL,
	`revision` text NOT NULL,
	`operation` text NOT NULL,
	`generation` integer NOT NULL,
	PRIMARY KEY(`wave_id`, `source_type`, `source_id`),
	FOREIGN KEY (`wave_id`) REFERENCES `projection_waves`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_projection_wave_inputs`("wave_id", "source_type", "source_id", "revision", "operation", "generation") SELECT "wave_id", "source_type", "source_id", "revision", "operation", "generation" FROM `projection_wave_inputs`;--> statement-breakpoint
DROP TABLE `projection_wave_inputs`;--> statement-breakpoint
ALTER TABLE `__new_projection_wave_inputs` RENAME TO `projection_wave_inputs`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `projection_wave_inputs_generation_idx` ON `projection_wave_inputs` (`wave_id`,`generation`);--> statement-breakpoint
ALTER TABLE `projection_dirty_inputs` DROP COLUMN `kind`;