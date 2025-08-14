#!/usr/bin/env bun
/**
 * Run database migrations for test-brain
 * Uses the centralized migration runner from @brains/app
 */
import { App } from "@brains/app";

// Run all database migrations using the centralized runner
await App.migrate();
