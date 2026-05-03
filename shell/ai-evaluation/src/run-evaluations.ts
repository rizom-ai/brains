#!/usr/bin/env bun
/**
 * Standalone evaluation runner
 *
 * Usage from an app directory:
 *   bun run eval                              # Run all evaluations
 *   bun run eval --test tool-invocation-list  # Run specific test(s)
 *   bun run eval --filter my-test            # Alias for --test
 *   bun run eval --tags core                  # Run only tests with 'core' tag
 *   bun run eval --skip-llm-judge             # Skip LLM quality scoring
 *   bun run eval --verbose                    # Show verbose output
 *   bun run eval --url http://localhost:8080  # Run against remote instance
 *   bun run eval --url http://localhost:8080 --token <token>  # With auth
 */

import { EvalHandlerRegistry } from "./eval-handler-registry";
import { parseCliOptions } from "./cli-options";
import { loadEvalConfig } from "./eval-config-loader";
import { buildEvalDatabase } from "./eval-db-builder";
import { runMultiModelEvaluation } from "./multi-model-runner";
import { runSingleModelEvaluation } from "./single-model-runner";
import { printHelp } from "./cli-help";
import { bootstrapCliEnvironment } from "./cli-bootstrap";
import { runEvaluations, runEvaluationsCollect } from "./evaluation-runner";

export { runEvaluations, runEvaluationsCollect };

/**
 * CLI entry point - parses args and runs evaluations
 * Expects to be called from an app directory with access to brain.eval.yaml or brain.eval.config.ts
 */
export async function main(): Promise<void> {
  const args = process.argv.slice(2);

  // Show help
  if (args.includes("--help") || args.includes("-h")) {
    printHelp();
    process.exit(0);
  }

  const {
    skipLLMJudge,
    parallel,
    maxParallel,
    verbose,
    tags,
    testCaseIds,
    testType,
    remoteUrl,
    authToken,
    compareAgainst,
    saveBaseline,
  } = parseCliOptions(args);

  try {
    const evalConfigResult = await loadEvalConfig();
    const {
      config,
      testCasesDirs,
      brainModelPath,
      models,
      judge,
      resolveConfig: freshResolve,
    } = evalConfigResult;

    // Shared eval environment setup
    const evalHandlerRegistry = EvalHandlerRegistry.getInstance();
    const cloneData = process.argv.includes("--clone-data");

    // ── Build eval DB ─────────────────────────────────────────────────
    if (args.includes("--build-db")) {
      await buildEvalDatabase({
        config,
        evalHandlerRegistry,
        brainModelPath,
        cloneData,
      });
      process.exit(0);
    }

    // ── Multi-model evaluation ──────────────────────────────────────────
    if (models.length > 0) {
      await runMultiModelEvaluation({
        models,
        judge,
        config,
        testCasesDirs,
        brainModelPath,
        evalHandlerRegistry,
        cloneData,
        skipLLMJudge,
        verbose,
        parallel,
        maxParallel,
        tags,
        testCaseIds,
        testType,
        remoteUrl,
        authToken,
        resolveConfig: freshResolve,
        runEvaluationsCollect,
      });
    }

    // ── Single-model evaluation (default) ───────────────────────────────
    await runSingleModelEvaluation({
      config,
      testCasesDirs,
      brainModelPath,
      evalHandlerRegistry,
      cloneData,
      skipLLMJudge,
      verbose,
      parallel,
      maxParallel,
      tags,
      testCaseIds,
      testType,
      remoteUrl,
      authToken,
      compareAgainst,
      saveBaseline,
      runEvaluations,
    });

    process.exit(0);
  } catch (error) {
    console.error("Failed to run evaluations:", error);
    process.exit(1);
  }
}

if (import.meta.main) {
  await bootstrapCliEnvironment();
  main().catch(console.error);
}
