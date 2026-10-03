DROP TABLE `assets`;
--> statement-breakpoint
CREATE TABLE `asset_chunks` (
	`upload_id` text NOT NULL,
	`ordinal` integer NOT NULL,
	`bytes` blob NOT NULL,
	PRIMARY KEY(`upload_id`, `ordinal`),
	FOREIGN KEY (`upload_id`) REFERENCES `asset_uploads`(`upload_id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "asset_chunks_ordinal_check" CHECK("asset_chunks"."ordinal" >= 0),
	CONSTRAINT "asset_chunks_bytes_type_check" CHECK(typeof("asset_chunks"."bytes") = 'blob'),
	CONSTRAINT "asset_chunks_bytes_length_check" CHECK(length("asset_chunks"."bytes") BETWEEN 1 AND 1048576)
);
--> statement-breakpoint
CREATE TABLE `asset_uploads` (
	`upload_id` text PRIMARY KEY NOT NULL,
	`created` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `assets` (
	`digest` text PRIMARY KEY NOT NULL,
	`upload_id` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`chunk_count` integer NOT NULL,
	`created` integer NOT NULL,
	FOREIGN KEY (`upload_id`) REFERENCES `asset_uploads`(`upload_id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "assets_digest_length_check" CHECK(length("assets"."digest") = 64),
	CONSTRAINT "assets_digest_alphabet_check" CHECK("assets"."digest" NOT GLOB '*[^0-9a-f]*'),
	CONSTRAINT "assets_size_nonnegative_check" CHECK("assets"."size_bytes" >= 0),
	CONSTRAINT "assets_chunk_count_check" CHECK("assets"."chunk_count" = ("assets"."size_bytes" + 1048575) / 1048576)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `assets_upload_id_unique` ON `assets` (`upload_id`);