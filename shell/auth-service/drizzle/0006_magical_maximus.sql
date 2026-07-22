PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_setup_tokens` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`purpose` text NOT NULL,
	`target_user_id` text,
	`delivery_claim_id` text,
	`expires_at` integer NOT NULL,
	`consumed_at` integer,
	`delivery_key_hash` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`target_user_id`) REFERENCES `auth_users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`delivery_claim_id`) REFERENCES `person_identity_claims`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "setup_tokens_delivery_requires_target_check" CHECK("__new_setup_tokens"."delivery_claim_id" IS NULL OR "__new_setup_tokens"."target_user_id" IS NOT NULL)
);
--> statement-breakpoint
INSERT INTO `__new_setup_tokens`("token_hash", "purpose", "target_user_id", "delivery_claim_id", "expires_at", "consumed_at", "delivery_key_hash", "created_at") SELECT "token_hash", "purpose", "target_user_id", NULL, "expires_at", "consumed_at", "delivery_key_hash", "created_at" FROM `setup_tokens`;--> statement-breakpoint
DROP TABLE `setup_tokens`;--> statement-breakpoint
ALTER TABLE `__new_setup_tokens` RENAME TO `setup_tokens`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `idx_setup_tokens_target_user_id` ON `setup_tokens` (`target_user_id`);--> statement-breakpoint
CREATE INDEX `idx_setup_tokens_delivery_claim_id` ON `setup_tokens` (`delivery_claim_id`);