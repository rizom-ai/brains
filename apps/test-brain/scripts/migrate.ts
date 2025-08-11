#!/usr/bin/env bun
/**
 * Run database migrations for test-brain
 * This script runs migrations for all databases: entities, job queue, and conversations
 */
import { migrateEntities } from "@brains/entity-service/migrate";
import { migrateJobQueue } from "@brains/job-queue";
import { migrateConversations } from "@brains/conversation-service";
import { Logger } from "@brains/utils";

// Set the DATABASE_URL if not already set
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = "file:./test-brain.db";
}

// Set the JOB_QUEUE_DATABASE_URL if not already set
if (!process.env.JOB_QUEUE_DATABASE_URL) {
  process.env.JOB_QUEUE_DATABASE_URL = "file:./test-brain-jobs.db";
}

// Set the CONVERSATION_DATABASE_URL if not already set
if (!process.env.CONVERSATION_DATABASE_URL) {
  process.env.CONVERSATION_DATABASE_URL = "file:./conversations.db";
}

// Create logger
const logger = Logger.getInstance();

// Run entity migrations
logger.info("Running entity database migrations...");
await migrateEntities(
  {
    url: process.env.DATABASE_URL,
  },
  logger,
);

// Run job queue migrations
logger.info("Running job queue database migrations...");
await migrateJobQueue(
  {
    url: process.env.JOB_QUEUE_DATABASE_URL,
  },
  logger,
);

// Run conversation migrations
logger.info("Running conversation database migrations...");
await migrateConversations(
  {
    url: process.env.CONVERSATION_DATABASE_URL,
  },
  logger,
);
