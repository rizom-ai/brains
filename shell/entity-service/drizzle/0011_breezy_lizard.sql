CREATE TABLE `entity_write_receipts` (
	`operation_id` text PRIMARY KEY NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`expected_revision` text
);
