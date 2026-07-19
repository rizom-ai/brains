CREATE TABLE `auth_brain_anchor` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`subject_id` text NOT NULL,
	`display_name` text NOT NULL,
	`profile_entity_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "auth_brain_anchor_singleton_check" CHECK("auth_brain_anchor"."id" = 'brain'),
	CONSTRAINT "auth_brain_anchor_kind_check" CHECK("auth_brain_anchor"."kind" IN ('person', 'collective'))
);
--> statement-breakpoint
-- Bounded historical transform: the oldest active legacy Anchor becomes the
-- personal brain anchor. Other legacy Anchors remain administrators.
INSERT INTO `auth_brain_anchor`
  (`id`, `kind`, `subject_id`, `display_name`, `profile_entity_id`, `created_at`, `updated_at`)
SELECT 'brain', 'person', users.`person_id`, people.`display_name`,
       people.`profile_entity_id`, users.`created_at`, users.`updated_at`
FROM `auth_users` AS users
JOIN `auth_people` AS people ON people.`id` = users.`person_id`
WHERE users.`role` = 'anchor' AND users.`status` = 'active'
ORDER BY users.`created_at`, users.`id`
LIMIT 1;
--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_auth_users` (
	`id` text PRIMARY KEY NOT NULL,
	`person_id` text NOT NULL,
	`display_name` text NOT NULL,
	`role` text NOT NULL,
	`status` text NOT NULL,
	`canonical_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`person_id`) REFERENCES `auth_people`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "auth_users_role_check" CHECK("__new_auth_users"."role" IN ('admin', 'trusted', 'public')),
	CONSTRAINT "auth_users_status_check" CHECK("__new_auth_users"."status" IN ('active', 'invited', 'suspended'))
);
--> statement-breakpoint
-- Bounded historical transform: normalize the deprecated permission role while
-- preserving every user id, person link, status, canonical id, and timestamp.
INSERT INTO `__new_auth_users`("id", "person_id", "display_name", "role", "status", "canonical_id", "created_at", "updated_at") SELECT "id", "person_id", "display_name", CASE WHEN "role" = 'anchor' THEN 'admin' ELSE "role" END, "status", "canonical_id", "created_at", "updated_at" FROM `auth_users`;--> statement-breakpoint
DROP TABLE `auth_users`;--> statement-breakpoint
ALTER TABLE `__new_auth_users` RENAME TO `auth_users`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `idx_auth_users_canonical_id` ON `auth_users` (`canonical_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_auth_users_person_id` ON `auth_users` (`person_id`);