CREATE TABLE `assets` (
	`digest` text PRIMARY KEY NOT NULL,
	`bytes` blob NOT NULL,
	`size_bytes` integer NOT NULL,
	`created` integer NOT NULL,
	CONSTRAINT "assets_digest_length_check" CHECK(length("assets"."digest") = 64),
	CONSTRAINT "assets_digest_alphabet_check" CHECK("assets"."digest" NOT GLOB '*[^0-9a-f]*'),
	CONSTRAINT "assets_bytes_type_check" CHECK(typeof("assets"."bytes") = 'blob'),
	CONSTRAINT "assets_size_nonnegative_check" CHECK("assets"."size_bytes" >= 0),
	CONSTRAINT "assets_size_matches_bytes_check" CHECK(length("assets"."bytes") = "assets"."size_bytes")
);
