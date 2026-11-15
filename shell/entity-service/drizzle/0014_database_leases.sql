CREATE TABLE `database_leases` (
	`id` text PRIMARY KEY NOT NULL,
	`role` text NOT NULL,
	`command` text,
	`hostname` text NOT NULL,
	`pid` integer NOT NULL,
	`started_at` integer NOT NULL,
	`heartbeat_at` integer NOT NULL,
	`expires_at` integer NOT NULL
);
