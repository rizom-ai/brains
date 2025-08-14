#!/usr/bin/env bun
/**
 * Run database migrations for test-brain
 * This script runs migrations for all databases: entities, job queue, and conversations
 */
import { migrateEntities } from "@brains/entity-service/migrate";
import { migrateJobQueue } from "@brains/job-queue";
import { migrateConversations } from "@brains/conversation-service";
import { Logger } from "@brains/utils";
import { getStandardConfigWithDirectories } from "@brains/core";

// Get standard configuration
const config = await getStandardConfigWithDirectories();

// Create logger
const logger = Logger.getInstance();

// Run entity migrations
logger.info("Running entity database migrations...");
await migrateEntities(config.database, logger);

// Run job queue migrations
logger.info("Running job queue database migrations...");
await migrateJobQueue(config.jobQueueDatabase, logger);

// Run conversation migrations
logger.info("Running conversation database migrations...");
await migrateConversations(config.conversationDatabase, logger);
