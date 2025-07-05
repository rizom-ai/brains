DROP TABLE `embedding_queue`;--> statement-breakpoint
CREATE UNIQUE INDEX `entity_type_id_unique` ON `entities` (`entityType`,`id`);