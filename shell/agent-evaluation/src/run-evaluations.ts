#!/usr/bin/env bun
/**
 * Standalone evaluation runner
 *
 * Usage from an app directory:
 *   bun run eval                    # Run all evaluations
 *   bun run eval --skip-llm-judge   # Skip LLM quality scoring
 *   bun run eval --tags core        # Run only tests with 'core' tag
 */

import { resolve } from "path";
import type { Shell } from "@brains/core";
import { EvaluationService } from "./evaluation-service";
import { ConsoleReporter } from "./reporters/console-reporter";
import { JSONReporter } from "./reporters/json-reporter";

export interface RunEvaluationsOptions {
  /** Shell instance to use */
  shell: Shell;
  /** Directory containing test cases */
  testCasesDir?: string;
  /** Directory to save results */
  resultsDir?: string;
  /** Skip LLM-as-judge scoring */
  skipLLMJudge?: boolean;
  /** Filter by tags */
  tags?: string[];
  /** Show verbose output */
  verbose?: boolean;
}

/**
 * Run evaluations against a shell instance
 */
export async function runEvaluations(
  options: RunEvaluationsOptions,
): Promise<void> {
  const {
    shell,
    testCasesDir = resolve(import.meta.dir, "../test-cases"),
    resultsDir = resolve(process.cwd(), "data/evaluation-results"),
    skipLLMJudge = false,
    tags,
    verbose = false,
  } = options;

  const agentService = shell.getAgentService();
  const aiService = shell.getAIService();

  const evaluationService = EvaluationService.createFresh({
    agentService,
    aiService,
    testCasesDirectory: testCasesDir,
    reporters: [
      ConsoleReporter.createFresh({ verbose, showFailures: true }),
      JSONReporter.createFresh({ outputDirectory: resultsDir }),
    ],
  });

  console.log(`\nRunning evaluations...`);
  console.log(`Test cases: ${testCasesDir}`);
  console.log(`Results: ${resultsDir}`);
  if (skipLLMJudge) console.log(`LLM Judge: skipped`);
  if (tags?.length) console.log(`Tags: ${tags.join(", ")}`);
  console.log("");

  const evalOptions = tags?.length ? { skipLLMJudge, tags } : { skipLLMJudge };
  const summary = await evaluationService.runEvaluations(evalOptions);

  // Exit with error code if any tests failed
  if (summary.failedTests > 0) {
    process.exit(1);
  }
}

/**
 * CLI entry point - parses args and runs evaluations
 * Expects to be called from an app directory with access to brain.config.ts
 */
export async function main(): Promise<void> {
  const args = process.argv.slice(2);

  // Parse CLI args
  const skipLLMJudge = args.includes("--skip-llm-judge");
  const verbose = args.includes("--verbose") || args.includes("-v");

  // Parse --tags flag
  const tagsIndex = args.indexOf("--tags");
  const tags =
    tagsIndex !== -1 && args[tagsIndex + 1]
      ? args[tagsIndex + 1]?.split(",")
      : undefined;

  // Try to load brain.config.ts from current directory
  const configPath = resolve(process.cwd(), "brain.config.ts");

  try {
    const configModule = await import(configPath);
    const config = configModule.default;

    if (!config) {
      console.error("No default export found in brain.config.ts");
      process.exit(1);
    }

    // Create and initialize the app
    const { App } = await import("@brains/app");
    const app = App.create(config);
    await app.initialize();

    const shell = app.getShell();

    const runOptions: RunEvaluationsOptions = {
      shell,
      skipLLMJudge,
      verbose,
    };
    if (tags?.length) {
      runOptions.tags = tags;
    }
    await runEvaluations(runOptions);

    process.exit(0);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ERR_MODULE_NOT_FOUND") {
      console.error(`Could not find brain.config.ts in ${process.cwd()}`);
      console.error(
        "Run this command from an app directory (e.g., apps/professional-brain)",
      );
    } else {
      console.error("Failed to run evaluations:", error);
    }
    process.exit(1);
  }
}

// Run if executed directly
if (import.meta.main) {
  main().catch(console.error);
}
