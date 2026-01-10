CREATE TABLE `entities` (
	`id` text NOT NULL,
	`entityType` text NOT NULL,
	`content` text NOT NULL,
	`contentHash` text NOT NULL,
	`metadata` text DEFAULT '{}' NOT NULL,
	`created` integer NOT NULL,
	`updated` integer NOT NULL,
	PRIMARY KEY(`id`, `entityType`)
);
--> statement-breakpoint
CREATE TABLE `embeddings` (
	`entity_id` text NOT NULL,
	`entity_type` text NOT NULL,
	`embedding` F32_BLOB(384) NOT NULL,
	`content_hash` text NOT NULL,
	PRIMARY KEY(`entity_id`, `entity_type`)
);
