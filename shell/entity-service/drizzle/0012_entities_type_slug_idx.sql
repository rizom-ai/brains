CREATE INDEX `entities_type_slug_idx` ON `entities` (`entityType`,json_extract(`metadata`, '$.slug'));
