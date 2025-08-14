#!/usr/bin/env bun
/**
 * Run database migrations for test-brain
 * This script runs migrations for all databases: entities, job queue, and conversations
 */
import { migrateEntities } from "@brains/entity-service/migrate";
import { migrateJobQueue } from "@brains/job-queue";
import { migrateConversations } from "@brains/conversation-service";
import { Logger } from "@brains/utils";

// Define database URLs matching the shell defaults
const DATABASE_URL = "file:./brain.db";
const JOB_QUEUE_DATABASE_URL = "file:./brain-jobs.db";
const CONVERSATION_DATABASE_URL = "file:./conversations.db";

// Create logger
const logger = Logger.getInstance();

// Run entity migrations
logger.info("Running entity database migrations...");
await migrateEntities(
  {
    url: DATABASE_URL,
  },
  logger,
);

// Run job queue migrations
logger.info("Running job queue database migrations...");
await migrateJobQueue(
  {
    url: JOB_QUEUE_DATABASE_URL,
  },
  logger,
);

// Run conversation migrations
logger.info("Running conversation database migrations...");
await migrateConversations(
  {
    url: CONVERSATION_DATABASE_URL,
  },
  logger,
);
