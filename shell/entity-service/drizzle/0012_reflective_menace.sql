DROP TABLE IF EXISTS `entity_fts`;--> statement-breakpoint
ALTER TABLE `entities` ADD `search_text` text;--> statement-breakpoint
ALTER TABLE `entity_job_outbox` ADD `parked_at` integer;--> statement-breakpoint
ALTER TABLE `entity_job_outbox` ADD `failure_reason` text;--> statement-breakpoint
CREATE INDEX `entity_job_outbox_pending_delivery_order_idx` ON `entity_job_outbox` (`parked_at`,`created_at`,`id`);