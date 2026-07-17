CREATE TABLE `setup_token_deliveries` (
	`token_hash` text NOT NULL,
	`recipient_hash` text NOT NULL,
	`delivered_at` integer NOT NULL,
	`delivery_id` text,
	PRIMARY KEY(`token_hash`, `recipient_hash`),
	FOREIGN KEY (`token_hash`) REFERENCES `setup_tokens`(`token_hash`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_setup_token_deliveries_token_hash` ON `setup_token_deliveries` (`token_hash`);
--> statement-breakpoint
-- Bounded historical transform: preserve the one delivery hash stored by the
-- pre-normalized runtime before new writes move to per-recipient rows.
INSERT OR IGNORE INTO `setup_token_deliveries`
  (`token_hash`, `recipient_hash`, `delivered_at`, `delivery_id`)
SELECT `token_hash`, `delivery_key_hash`, `created_at`, NULL
FROM `setup_tokens`
WHERE `delivery_key_hash` IS NOT NULL;