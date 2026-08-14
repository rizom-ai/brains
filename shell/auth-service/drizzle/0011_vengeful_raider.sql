CREATE TABLE `auth_account_plugin_settings` (
	`package_name` text NOT NULL,
	`definition_id` text NOT NULL,
	`actor_id` text NOT NULL,
	`payload` text NOT NULL,
	`revision` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`package_name`, `definition_id`, `actor_id`),
	FOREIGN KEY (`actor_id`) REFERENCES `auth_users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "auth_account_plugin_settings_revision_check" CHECK("auth_account_plugin_settings"."revision" > 0)
);
--> statement-breakpoint
CREATE INDEX `idx_auth_account_plugin_settings_actor_id` ON `auth_account_plugin_settings` (`actor_id`);