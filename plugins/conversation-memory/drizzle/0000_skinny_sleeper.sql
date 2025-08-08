CREATE TABLE `conversations` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`interface_type` text NOT NULL,
	`started` text NOT NULL,
	`last_active` text NOT NULL,
	`metadata` text,
	`created` text NOT NULL,
	`updated` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_conversations_session` ON `conversations` (`session_id`);--> statement-breakpoint
CREATE INDEX `idx_conversations_interface_session` ON `conversations` (`interface_type`,`session_id`);--> statement-breakpoint
CREATE TABLE `messages` (
	`id` text PRIMARY KEY NOT NULL,
	`conversation_id` text NOT NULL,
	`role` text NOT NULL,
	`content` text NOT NULL,
	`timestamp` text NOT NULL,
	`metadata` text,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_messages_conversation` ON `messages` (`conversation_id`);--> statement-breakpoint
CREATE INDEX `idx_messages_timestamp` ON `messages` (`timestamp`);--> statement-breakpoint
CREATE TABLE `summary_tracking` (
	`conversation_id` text PRIMARY KEY NOT NULL,
	`last_summarized_at` text,
	`last_message_id` text,
	`messages_since_summary` integer DEFAULT 0,
	`updated` text NOT NULL,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE cascade
);
