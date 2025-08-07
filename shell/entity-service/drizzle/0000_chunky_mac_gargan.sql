CREATE TABLE `entities` (
	`id` text NOT NULL,
	`entityType` text NOT NULL,
	`content` text NOT NULL,
	`metadata` text DEFAULT '{}' NOT NULL,
	`contentWeight` real DEFAULT 1 NOT NULL,
	`embedding` F32_BLOB(384) NOT NULL,
	`created` integer NOT NULL,
	`updated` integer NOT NULL,
	PRIMARY KEY(`id`, `entityType`)
);
