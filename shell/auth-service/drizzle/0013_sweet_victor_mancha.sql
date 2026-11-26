ALTER TABLE `auth_users` ADD `username` text;--> statement-breakpoint
CREATE UNIQUE INDEX `idx_auth_users_username` ON `auth_users` (`username`);--> statement-breakpoint
ALTER TABLE `oauth_auth_codes` ADD `nonce` text;