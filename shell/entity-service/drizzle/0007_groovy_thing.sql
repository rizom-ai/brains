PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_embeddings` (
	`entity_id` text NOT NULL,
	`entity_type` text NOT NULL,
	`embedding` F32_BLOB(1536) NOT NULL,
	`content_hash` text NOT NULL,
	PRIMARY KEY(`entity_id`, `entity_type`),
	FOREIGN KEY (`entity_id`,`entity_type`) REFERENCES `entities`(`id`,`entityType`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
-- Embeddings are derived and lack model provenance, so regenerate them with
-- the active provider instead of copying potentially incompatible vectors.
DROP TABLE `embeddings`;--> statement-breakpoint
ALTER TABLE `__new_embeddings` RENAME TO `embeddings`;--> statement-breakpoint
PRAGMA foreign_keys=ON;