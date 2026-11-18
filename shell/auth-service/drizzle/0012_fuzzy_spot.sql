CREATE TABLE `auth_app_passwords` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`label` text NOT NULL,
	`access` text NOT NULL,
	`secret_hash` text NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`last_used_at` integer,
	`revoked_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `auth_users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "auth_app_passwords_access_check" CHECK("auth_app_passwords"."access" IN ('read', 'write'))
);
--> statement-breakpoint
CREATE INDEX `idx_auth_app_passwords_user_id` ON `auth_app_passwords` (`user_id`);