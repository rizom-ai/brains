CREATE TABLE `a2a_peer_trust` (
	`domain` text PRIMARY KEY NOT NULL,
	`key_fingerprint` text NOT NULL,
	`granted_level` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "a2a_peer_trust_granted_level_check" CHECK("a2a_peer_trust"."granted_level" IN ('public', 'trusted'))
);
--> statement-breakpoint
CREATE TABLE `agent_person_links` (
	`agent_id` text PRIMARY KEY NOT NULL,
	`person_id` text NOT NULL,
	`status` text NOT NULL,
	`created_by_user_id` text,
	`consented_by_user_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`person_id`) REFERENCES `auth_people`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `auth_users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`consented_by_user_id`) REFERENCES `auth_users`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "agent_person_links_status_check" CHECK("agent_person_links"."status" IN ('pending', 'active', 'revoked'))
);
--> statement-breakpoint
CREATE INDEX `idx_agent_person_links_person_id` ON `agent_person_links` (`person_id`);--> statement-breakpoint
CREATE TABLE `auth_audit_events` (
	`id` text PRIMARY KEY NOT NULL,
	`actor_user_id` text,
	`action` text NOT NULL,
	`target_type` text,
	`target_id` text,
	`metadata_json` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`actor_user_id`) REFERENCES `auth_users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_auth_audit_events_actor_user_id` ON `auth_audit_events` (`actor_user_id`);--> statement-breakpoint
CREATE TABLE `person_identity_claims` (
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
	CONSTRAINT "person_identity_claims_type_check" CHECK("person_identity_claims"."type" IN ('passkey', 'discord', 'mcp', 'oauth', 'email', 'did', 'a2a')),
	CONSTRAINT "person_identity_claims_visibility_check" CHECK("person_identity_claims"."visibility" IN ('private', 'trusted', 'public'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_person_identity_claims_active_key` ON `person_identity_claims` (`identity_key_hash`) WHERE revoked_at IS NULL;--> statement-breakpoint
CREATE INDEX `idx_person_identity_claims_key` ON `person_identity_claims` (`identity_key_hash`);--> statement-breakpoint
CREATE INDEX `idx_person_identity_claims_person_id` ON `person_identity_claims` (`person_id`);--> statement-breakpoint
CREATE TABLE `auth_identity_evidence` (
	`id` text PRIMARY KEY NOT NULL,
	`claim_id` text NOT NULL,
	`source_kind` text NOT NULL,
	`source_id` text,
	`assurance` text NOT NULL,
	`verified_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`claim_id`) REFERENCES `person_identity_claims`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "auth_identity_evidence_source_kind_check" CHECK("auth_identity_evidence"."source_kind" IN ('admin', 'agent', 'migration', 'provider')),
	CONSTRAINT "auth_identity_evidence_assurance_check" CHECK("auth_identity_evidence"."assurance" IN ('asserted', 'verified')),
	CONSTRAINT "auth_identity_evidence_verification_check" CHECK(("auth_identity_evidence"."assurance" = 'asserted' AND "auth_identity_evidence"."verified_at" IS NULL)
          OR ("auth_identity_evidence"."assurance" = 'verified' AND "auth_identity_evidence"."verified_at" IS NOT NULL))
);
--> statement-breakpoint
CREATE INDEX `idx_auth_identity_evidence_claim_id` ON `auth_identity_evidence` (`claim_id`);--> statement-breakpoint
CREATE INDEX `idx_auth_identity_evidence_verified` ON `auth_identity_evidence` (`claim_id`,`assurance`);--> statement-breakpoint
CREATE TABLE `auth_legacy_imports` (
	`source` text PRIMARY KEY NOT NULL,
	`completed_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `auth_people` (
	`id` text PRIMARY KEY NOT NULL,
	`display_name` text NOT NULL,
	`profile_entity_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_auth_people_profile_entity_id` ON `auth_people` (`profile_entity_id`);--> statement-breakpoint
CREATE TABLE `auth_sessions` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`expires_at` integer NOT NULL,
	`revoked_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `auth_users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_auth_sessions_user_id` ON `auth_sessions` (`user_id`);--> statement-breakpoint
CREATE TABLE `auth_users` (
	`id` text PRIMARY KEY NOT NULL,
	`person_id` text NOT NULL,
	`display_name` text NOT NULL,
	`role` text NOT NULL,
	`status` text NOT NULL,
	`canonical_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`person_id`) REFERENCES `auth_people`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "auth_users_role_check" CHECK("auth_users"."role" IN ('anchor', 'trusted', 'public')),
	CONSTRAINT "auth_users_status_check" CHECK("auth_users"."status" IN ('active', 'invited', 'suspended'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_auth_users_canonical_id` ON `auth_users` (`canonical_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_auth_users_person_id` ON `auth_users` (`person_id`);--> statement-breakpoint
CREATE TABLE `oauth_auth_codes` (
	`code_hash` text PRIMARY KEY NOT NULL,
	`client_id` text NOT NULL,
	`user_id` text NOT NULL,
	`redirect_uri` text NOT NULL,
	`pkce_challenge` text NOT NULL,
	`scope` text NOT NULL,
	`expires_at` integer NOT NULL,
	`consumed_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `oauth_clients`(`client_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `auth_users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_oauth_auth_codes_client_id` ON `oauth_auth_codes` (`client_id`);--> statement-breakpoint
CREATE TABLE `oauth_clients` (
	`client_id` text PRIMARY KEY NOT NULL,
	`secret_hash` text,
	`metadata_json` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `oauth_refresh_tokens` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`client_id` text NOT NULL,
	`user_id` text NOT NULL,
	`scope` text NOT NULL,
	`expires_at` integer NOT NULL,
	`revoked_at` integer,
	`replaced_by_hash` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `oauth_clients`(`client_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `auth_users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_oauth_refresh_tokens_user_id` ON `oauth_refresh_tokens` (`user_id`);--> statement-breakpoint
CREATE TABLE `oauth_signing_keys` (
	`kid` text PRIMARY KEY NOT NULL,
	`purpose` text NOT NULL,
	`private_jwk` text NOT NULL,
	`status` text NOT NULL,
	`created_at` integer NOT NULL,
	`retired_at` integer,
	CONSTRAINT "oauth_signing_keys_purpose_check" CHECK("oauth_signing_keys"."purpose" IN ('oauth', 'a2a')),
	CONSTRAINT "oauth_signing_keys_status_check" CHECK("oauth_signing_keys"."status" IN ('active', 'retired'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_oauth_signing_keys_active_purpose` ON `oauth_signing_keys` (`purpose`) WHERE status = 'active';--> statement-breakpoint
CREATE TABLE `passkey_credentials` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`public_key` text NOT NULL,
	`counter` integer NOT NULL,
	`transports_json` text,
	`credential_device_type` text,
	`credential_backed_up` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`revoked_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `auth_users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_passkey_credentials_user_id` ON `passkey_credentials` (`user_id`);--> statement-breakpoint
CREATE TABLE `setup_tokens` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`purpose` text NOT NULL,
	`target_user_id` text,
	`expires_at` integer NOT NULL,
	`consumed_at` integer,
	`delivery_key_hash` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`target_user_id`) REFERENCES `auth_users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_setup_tokens_target_user_id` ON `setup_tokens` (`target_user_id`);--> statement-breakpoint
CREATE TABLE `webauthn_challenges` (
	`challenge_hash` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`kind` text NOT NULL,
	`expires_at` integer NOT NULL,
	`consumed_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `auth_users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "webauthn_challenges_kind_check" CHECK("webauthn_challenges"."kind" IN ('registration', 'authentication'))
);
--> statement-breakpoint
CREATE INDEX `idx_webauthn_challenges_user_id` ON `webauthn_challenges` (`user_id`);