PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_person_identity_claims` (
	`id` text PRIMARY KEY NOT NULL,
	`person_id` text NOT NULL,
	`type` text NOT NULL,
	`issuer` text,
	`identity_key_hash` text NOT NULL,
	`delivery_subject` text,
	`label` text,
	`visibility` text NOT NULL,
	`revoked_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`person_id`) REFERENCES `auth_people`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "person_identity_claims_visibility_check" CHECK("__new_person_identity_claims"."visibility" IN ('private', 'trusted', 'public'))
);
--> statement-breakpoint
INSERT INTO `__new_person_identity_claims`("id", "person_id", "type", "issuer", "identity_key_hash", "delivery_subject", "label", "visibility", "revoked_at", "created_at") SELECT "id", "person_id", "type", "issuer", "identity_key_hash", "delivery_subject", "label", "visibility", "revoked_at", "created_at" FROM `person_identity_claims`;--> statement-breakpoint
DROP TABLE `person_identity_claims`;--> statement-breakpoint
ALTER TABLE `__new_person_identity_claims` RENAME TO `person_identity_claims`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `idx_person_identity_claims_active_key` ON `person_identity_claims` (`identity_key_hash`) WHERE revoked_at IS NULL;--> statement-breakpoint
CREATE INDEX `idx_person_identity_claims_key` ON `person_identity_claims` (`identity_key_hash`);--> statement-breakpoint
CREATE INDEX `idx_person_identity_claims_person_id` ON `person_identity_claims` (`person_id`);