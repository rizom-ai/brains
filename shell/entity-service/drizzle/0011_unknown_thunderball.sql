CREATE INDEX `entities_type_visibility_source_summary_idx` ON `entities` (`entityType`, `visibility`, json_extract(`metadata`, '$.sourceSummaryId'));
