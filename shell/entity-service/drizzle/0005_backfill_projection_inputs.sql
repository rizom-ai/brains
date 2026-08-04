INSERT INTO `projection_dirty_inputs` (
	`source_type`,
	`source_id`,
	`revision`,
	`operation`,
	`marked_at`
)
SELECT
	`entityType`,
	`id`,
	`contentHash` || ':' || `updated`,
	'upsert',
	unixepoch() * 1000
FROM `entities`;
