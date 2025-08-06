#!/usr/bin/env bun
/**
 * Run database migrations for test-brain
 * This script runs migrations for both the main database and job queue database
 */
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { migrateJobQueue } from "@brains/job-queue";
import { Logger } from "@brains/utils";

// Set the DATABASE_URL if not already set
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = "file:./test-brain.db";
}

// Set the JOB_QUEUE_DATABASE_URL if not already set
if (!process.env.JOB_QUEUE_DATABASE_URL) {
  process.env.JOB_QUEUE_DATABASE_URL = "file:./test-brain-jobs.db";
}

// Set the migration folder to the @brains/db drizzle folder
// This resolves the actual location of the @brains/db package
const dbPackagePath = dirname(fileURLToPath(import.meta.resolve("@brains/db")));
process.env.DRIZZLE_MIGRATION_FOLDER = join(dbPackagePath, "..", "drizzle");

// Create logger
const logger = Logger.getInstance();

// Import and run the main database migrations
logger.info("Running main database migrations...");
await import("@brains/db/migrate");

// Run job queue migrations
logger.info("Running job queue database migrations...");
await migrateJobQueue(
  {
    url: process.env.JOB_QUEUE_DATABASE_URL,
  },
  logger,
);
