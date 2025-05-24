CREATE TABLE `entities` (
	`id` text PRIMARY KEY NOT NULL,
	`entityType` text NOT NULL,
	`title` text NOT NULL,
	`content` text NOT NULL,
	`contentWeight` real DEFAULT 1 NOT NULL,
	`tags` text DEFAULT '[]' NOT NULL,
	`embedding` F32_BLOB(1536),
	`embeddingStatus` text DEFAULT 'pending',
	`created` integer NOT NULL,
	`updated` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `entity_relations` (
	`id` text PRIMARY KEY NOT NULL,
	`source_id` text NOT NULL,
	`target_id` text NOT NULL,
	`relation_type` text NOT NULL,
	`metadata` text DEFAULT '{}',
	`created` integer NOT NULL,
	FOREIGN KEY (`source_id`) REFERENCES `entities`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`target_id`) REFERENCES `entities`(`id`) ON UPDATE no action ON DELETE cascade
);
