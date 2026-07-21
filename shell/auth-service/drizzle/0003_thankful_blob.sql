CREATE TABLE `person_external_peers` (
	`peer_id` text PRIMARY KEY NOT NULL,
	`person_id` text NOT NULL,
	`verification_status` text NOT NULL,
	`created_by_user_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`person_id`) REFERENCES `auth_people`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `auth_users`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "person_external_peers_verification_status_check" CHECK("person_external_peers"."verification_status" IN ('unverified', 'verified'))
);
--> statement-breakpoint
CREATE INDEX `idx_person_external_peers_person_id` ON `person_external_peers` (`person_id`);