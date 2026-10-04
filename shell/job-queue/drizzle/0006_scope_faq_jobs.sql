-- One-way upgrade of persisted FAQ dispatch and ownership identities.
-- Stop old writers before startup; mixed-version execution and downgrade are unsupported.
-- Keep IDs, payloads (including reply keys/positions), status, attempts and locks unchanged.
UPDATE `job_queue`
SET `type` = CASE `type`
  WHEN 'faq:faq-capture' THEN '@brains/faq:capture:faq-capture'
  WHEN 'faq:faq-reconcile' THEN '@brains/faq:capture:faq-reconcile'
END,
`metadata` = json_set(`metadata`, '$.pluginId', '@brains/faq:capture'),
`source` = '@brains/faq:capture'
WHERE `type` IN ('faq:faq-capture', 'faq:faq-reconcile')
  AND `source` = 'faq'
  AND CASE WHEN json_valid(`metadata`)
    THEN json_extract(`metadata`, '$.pluginId') END = 'faq';
