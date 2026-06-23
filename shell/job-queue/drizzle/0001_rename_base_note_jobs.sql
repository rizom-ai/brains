UPDATE `job_queue`
SET `type` = 'note:generation'
WHERE `type` = 'base:generation';
--> statement-breakpoint
UPDATE `job_queue`
SET `data` = replace(`data`, '"entityType":"base"', '"entityType":"note"')
WHERE `data` LIKE '%"entityType":"base"%';
--> statement-breakpoint
UPDATE `job_queue`
SET `data` = replace(`data`, '"sourceEntityType":"base"', '"sourceEntityType":"note"')
WHERE `data` LIKE '%"sourceEntityType":"base"%';
--> statement-breakpoint
UPDATE `job_queue`
SET `data` = replace(`data`, '"targetEntityType":"base"', '"targetEntityType":"note"')
WHERE `data` LIKE '%"targetEntityType":"base"%';
