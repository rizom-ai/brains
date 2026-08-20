CREATE TABLE `projection_entity_owners` (
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`rule_id` text NOT NULL,
	`rule_version` text NOT NULL,
	`input_fingerprint` text NOT NULL,
	`claimed_at` integer NOT NULL,
	PRIMARY KEY(`entity_type`, `entity_id`)
);
--> statement-breakpoint
CREATE INDEX `projection_entity_owners_rule_idx` ON `projection_entity_owners` (`rule_id`);
--> statement-breakpoint
WITH `completed_rule_runs` AS (
	SELECT
		`rules`.`rule_id`,
		`rules`.`input_fingerprint`,
		`waves`.`completed_at`,
		row_number() OVER (
			PARTITION BY `rules`.`rule_id`
			ORDER BY `waves`.`completed_at` DESC, `waves`.`id` DESC
		) AS `run_rank`
	FROM `projection_wave_rules` AS `rules`
	INNER JOIN `projection_waves` AS `waves`
		ON `waves`.`id` = `rules`.`wave_id`
	WHERE
		`rules`.`status` = 'completed'
		AND `rules`.`input_fingerprint` IS NOT NULL
		AND `waves`.`status` = 'completed'
		AND `waves`.`completed_at` IS NOT NULL
),
`latest_rule_memos` AS (
	SELECT
		`runs`.`rule_id`,
		`memos`.`rule_version`,
		`memos`.`input_fingerprint`,
		`memos`.`write_intents`,
		`runs`.`completed_at`,
		row_number() OVER (
			PARTITION BY `runs`.`rule_id`
			ORDER BY `memos`.`created_at` DESC, `memos`.`rule_version` DESC
		) AS `memo_rank`
	FROM `completed_rule_runs` AS `runs`
	INNER JOIN `projection_rule_memos` AS `memos`
		ON `memos`.`rule_id` = `runs`.`rule_id`
		AND `memos`.`input_fingerprint` = `runs`.`input_fingerprint`
	WHERE `runs`.`run_rank` = 1
)
INSERT INTO `projection_entity_owners` (
	`entity_type`,
	`entity_id`,
	`rule_id`,
	`rule_version`,
	`input_fingerprint`,
	`claimed_at`
)
SELECT
	json_extract(`intent`.`value`, '$.entity.entityType'),
	json_extract(`intent`.`value`, '$.entity.id'),
	`memos`.`rule_id`,
	`memos`.`rule_version`,
	`memos`.`input_fingerprint`,
	`memos`.`completed_at`
FROM `latest_rule_memos` AS `memos`
INNER JOIN json_each(`memos`.`write_intents`) AS `intent`
INNER JOIN `entities`
	ON `entities`.`entityType` = json_extract(`intent`.`value`, '$.entity.entityType')
	AND `entities`.`id` = json_extract(`intent`.`value`, '$.entity.id')
WHERE
	`memos`.`memo_rank` = 1
	AND json_extract(`intent`.`value`, '$.operation') = 'upsert'
	AND `entities`.`updated` <= `memos`.`completed_at`
	AND NOT EXISTS (
		SELECT 1
		FROM `projection_dirty_inputs` AS `dirty`
		WHERE
			`dirty`.`source_type` = `entities`.`entityType`
			AND `dirty`.`source_id` = `entities`.`id`
	)
ON CONFLICT (`entity_type`, `entity_id`) DO UPDATE SET
	`rule_id` = excluded.`rule_id`,
	`rule_version` = excluded.`rule_version`,
	`input_fingerprint` = excluded.`input_fingerprint`,
	`claimed_at` = excluded.`claimed_at`;