CREATE TABLE `auth_access_seed_state` (
	`id` text PRIMARY KEY NOT NULL,
	`seeded_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "auth_access_seed_state_singleton_check" CHECK("auth_access_seed_state"."id" = 'config')
);
--> statement-breakpoint
CREATE TABLE `interface_anchor_bindings` (
	`id` text PRIMARY KEY NOT NULL,
	`interface_type` text NOT NULL,
	`principal_key_hash` text NOT NULL,
	`source` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`revoked_at` integer,
	CONSTRAINT "interface_anchor_bindings_source_check" CHECK("interface_anchor_bindings"."source" IN ('config', 'admin'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_interface_anchor_bindings_active_principal` ON `interface_anchor_bindings` (`interface_type`,`principal_key_hash`) WHERE revoked_at IS NULL;--> statement-breakpoint
CREATE TABLE `interface_principal_grants` (
	`id` text PRIMARY KEY NOT NULL,
	`interface_type` text NOT NULL,
	`principal_key_hash` text NOT NULL,
	`permission_level` text NOT NULL,
	`source` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`revoked_at` integer,
	CONSTRAINT "interface_principal_grants_permission_level_check" CHECK("interface_principal_grants"."permission_level" IN ('admin', 'trusted')),
	CONSTRAINT "interface_principal_grants_source_check" CHECK("interface_principal_grants"."source" IN ('config', 'admin'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_interface_principal_grants_active_principal` ON `interface_principal_grants` (`interface_type`,`principal_key_hash`) WHERE revoked_at IS NULL;