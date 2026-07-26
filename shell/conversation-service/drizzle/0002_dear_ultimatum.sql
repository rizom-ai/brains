ALTER TABLE `conversations` ADD `person_id` text;--> statement-breakpoint
CREATE INDEX `idx_conversations_person` ON `conversations` (`person_id`);