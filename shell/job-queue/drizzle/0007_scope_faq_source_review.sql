-- One-way dispatch upgrade; stop old writers before startup.
-- Preserve withdrawal IDs, payloads, status, attempts and locks.
UPDATE `job_queue`
SET `type` = '@brains/faq:capture:faq-source-review',
    `metadata` = json_set(`metadata`, '$.pluginId', '@brains/faq:capture'),
    `source` = '@brains/faq:capture'
WHERE `type` = 'faq:faq-source-review'
  AND `source` = 'faq'
  AND CASE WHEN json_valid(`metadata`)
    THEN json_extract(`metadata`, '$.pluginId') END = 'faq';
