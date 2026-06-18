UPDATE `entities` SET `entityType` = 'note' WHERE `entityType` = 'base';
--> statement-breakpoint
UPDATE `embeddings` SET `entity_type` = 'note' WHERE `entity_type` = 'base';
