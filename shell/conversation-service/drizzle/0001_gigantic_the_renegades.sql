ALTER TABLE `conversations` ADD `channel_id` text NOT NULL;--> statement-breakpoint
CREATE INDEX `idx_conversations_channel` ON `conversations` (`channel_id`);--> statement-breakpoint
CREATE INDEX `idx_conversations_interface_channel` ON `conversations` (`interface_type`,`channel_id`);