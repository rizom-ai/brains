CREATE TABLE `entity_mutation_receipts` (
	`namespace` text NOT NULL,
	`key` text NOT NULL,
	`result` text NOT NULL,
	`recorded_at` integer NOT NULL,
	PRIMARY KEY(`namespace`, `key`)
);
