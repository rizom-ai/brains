CREATE TABLE `auth_invitation_delivery_attempts` (
	`id` text PRIMARY KEY NOT NULL,
	`invitation_id` text NOT NULL,
	`setup_token_hash` text NOT NULL,
	`provider_id` text NOT NULL,
	`provider_delivery_id` text,
	`state` text NOT NULL,
	`failure_code` text,
	`queued_at` integer NOT NULL,
	`started_at` integer,
	`completed_at` integer,
	FOREIGN KEY (`invitation_id`) REFERENCES `auth_invitations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`setup_token_hash`) REFERENCES `setup_tokens`(`token_hash`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "auth_invitation_delivery_attempts_state_check" CHECK("auth_invitation_delivery_attempts"."state" IN ('queued', 'sending', 'sent', 'failed'))
);
--> statement-breakpoint
CREATE INDEX `idx_auth_invitation_delivery_attempts_invitation_id` ON `auth_invitation_delivery_attempts` (`invitation_id`);--> statement-breakpoint
CREATE INDEX `idx_auth_invitation_delivery_attempts_state` ON `auth_invitation_delivery_attempts` (`state`);--> statement-breakpoint
CREATE TABLE `auth_invitations` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`delivery_claim_id` text NOT NULL,
	`current_setup_token_hash` text NOT NULL,
	`created_by_user_id` text,
	`idempotency_key_hash` text NOT NULL,
	`state` text NOT NULL,
	`failure_code` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`sent_at` integer,
	`claimed_at` integer,
	`expired_at` integer,
	`cancelled_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `auth_users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`delivery_claim_id`) REFERENCES `person_identity_claims`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`current_setup_token_hash`) REFERENCES `setup_tokens`(`token_hash`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `auth_users`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "auth_invitations_state_check" CHECK("auth_invitations"."state" IN ('pending', 'sending', 'sent', 'claimed', 'expired', 'cancelled', 'failed'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_auth_invitations_idempotency_key` ON `auth_invitations` (`idempotency_key_hash`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_auth_invitations_current_setup_token` ON `auth_invitations` (`current_setup_token_hash`);--> statement-breakpoint
CREATE INDEX `idx_auth_invitations_user_id` ON `auth_invitations` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_auth_invitations_state` ON `auth_invitations` (`state`);