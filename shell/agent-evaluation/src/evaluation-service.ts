import type { IAgentService } from "@brains/agent-service";
import type { IAIService } from "@brains/ai-service";

import type {
  IEvaluationService,
  ITestCaseLoader,
  IReporter,
  EvaluationOptions,
} from "./types";
import type {
  TestCase,
  EvaluationResult,
  EvaluationSummary,
  QualityScores,
} from "./schemas";
import { TestRunner } from "./test-runner";
import { LLMJudge } from "./llm-judge";
import { YAMLLoader } from "./loaders/yaml-loader";

/**
 * Configuration for the evaluation service
 */
export interface EvaluationServiceConfig {
  agentService: IAgentService;
  aiService: IAIService;
  testCasesDirectory: string;
  reporters?: IReporter[];
}

/**
 * Main orchestration service for running evaluations
 */
export class EvaluationService implements IEvaluationService {
  private agentService: IAgentService;
  private aiService: IAIService;
  private loader: ITestCaseLoader;
  private reporters: IReporter[];

  constructor(config: EvaluationServiceConfig) {
    this.agentService = config.agentService;
    this.aiService = config.aiService;
    this.loader = YAMLLoader.createFresh({
      directory: config.testCasesDirectory,
      recursive: true,
    });
    this.reporters = config.reporters ?? [];
  }

  /**
   * Run evaluations against test cases
   */
  async runEvaluations(
    options: EvaluationOptions = {},
  ): Promise<EvaluationSummary> {
    // Load test cases
    let testCases = await this.loader.loadTestCases();

    // Filter by IDs
    if (options.testCaseIds?.length) {
      const ids = options.testCaseIds;
      testCases = testCases.filter((tc) => ids.includes(tc.id));
    }

    // Filter by tags
    if (options.tags?.length) {
      const filterTags = options.tags;
      testCases = testCases.filter((tc) =>
        tc.tags?.some((tag) => filterTags.includes(tag)),
      );
    }

    // Create LLM judge if not skipped
    const llmJudge = options.skipLLMJudge
      ? undefined
      : LLMJudge.createFresh(
          this.aiService,
          options.llmJudgeSampleRate !== undefined
            ? { sampleRate: options.llmJudgeSampleRate }
            : undefined,
        );

    // Create test runner
    const testRunner = TestRunner.createFresh(this.agentService, llmJudge);

    // Run tests
    const results: EvaluationResult[] = [];

    if (options.parallel && options.maxParallel && options.maxParallel > 1) {
      // Parallel execution with concurrency limit
      results.push(...(await this.runParallel(testCases, testRunner, options)));
    } else {
      // Sequential execution
      for (const testCase of testCases) {
        const runnerOptions =
          options.skipLLMJudge !== undefined
            ? { skipLLMJudge: options.skipLLMJudge }
            : undefined;
        const result = await testRunner.runTest(testCase, runnerOptions);
        results.push(result);
      }
    }

    // Generate summary
    const summary = this.generateSummary(results);

    // Run reporters
    for (const reporter of this.reporters) {
      await reporter.report(summary);
    }

    return summary;
  }

  /**
   * Run tests in parallel with concurrency limit
   */
  private async runParallel(
    testCases: TestCase[],
    testRunner: TestRunner,
    options: EvaluationOptions,
  ): Promise<EvaluationResult[]> {
    const maxParallel = options.maxParallel ?? 3;
    const results: EvaluationResult[] = [];
    const pending: Promise<void>[] = [];

    const runnerOptions =
      options.skipLLMJudge !== undefined
        ? { skipLLMJudge: options.skipLLMJudge }
        : undefined;

    for (const testCase of testCases) {
      const promise = (async (): Promise<void> => {
        const result = await testRunner.runTest(testCase, runnerOptions);
        results.push(result);
      })();

      pending.push(promise);

      // Wait when we hit the limit
      if (pending.length >= maxParallel) {
        await Promise.race(pending);
        // Remove completed promises
        const stillPending: Promise<void>[] = [];
        for (const p of pending) {
          const resolved = await Promise.race([
            p.then(() => true),
            Promise.resolve(false),
          ]);
          if (!resolved) {
            stillPending.push(p);
          }
        }
        pending.length = 0;
        pending.push(...stillPending);
      }
    }

    // Wait for remaining
    await Promise.all(pending);

    return results;
  }

  /**
   * List available test cases
   */
  async listTestCases(tags?: string[]): Promise<TestCase[]> {
    let testCases = await this.loader.loadTestCases();

    if (tags?.length) {
      testCases = testCases.filter((tc) =>
        tc.tags?.some((tag) => tags.includes(tag)),
      );
    }

    return testCases;
  }

  /**
   * Generate summary from results
   */
  private generateSummary(results: EvaluationResult[]): EvaluationSummary {
    const passedTests = results.filter((r) => r.passed).length;
    const failedTests = results.length - passedTests;

    // Calculate average metrics
    const avgMetrics = {
      totalTokens:
        results.reduce((sum, r) => sum + r.totalMetrics.totalTokens, 0) /
        Math.max(results.length, 1),
      toolCallCount:
        results.reduce((sum, r) => sum + r.totalMetrics.toolCallCount, 0) /
        Math.max(results.length, 1),
      durationMs:
        results.reduce((sum, r) => sum + r.totalMetrics.durationMs, 0) /
        Math.max(results.length, 1),
    };

    // Calculate average quality scores
    const resultsWithScores = results.filter((r) => r.qualityScores);
    let avgQualityScores: QualityScores | undefined;

    if (resultsWithScores.length > 0) {
      avgQualityScores = {
        helpfulness:
          resultsWithScores.reduce(
            (sum, r) => sum + (r.qualityScores?.helpfulness ?? 0),
            0,
          ) / resultsWithScores.length,
        accuracy:
          resultsWithScores.reduce(
            (sum, r) => sum + (r.qualityScores?.accuracy ?? 0),
            0,
          ) / resultsWithScores.length,
        instructionFollowing:
          resultsWithScores.reduce(
            (sum, r) => sum + (r.qualityScores?.instructionFollowing ?? 0),
            0,
          ) / resultsWithScores.length,
        appropriateToolUse:
          resultsWithScores.reduce(
            (sum, r) => sum + (r.qualityScores?.appropriateToolUse ?? 0),
            0,
          ) / resultsWithScores.length,
      };
    }

    return {
      timestamp: new Date().toISOString(),
      totalTests: results.length,
      passedTests,
      failedTests,
      passRate: results.length > 0 ? passedTests / results.length : 0,
      avgMetrics,
      avgQualityScores,
      results,
    };
  }

  /**
   * Add a reporter
   */
  addReporter(reporter: IReporter): void {
    this.reporters.push(reporter);
  }

  /**
   * Create a fresh evaluation service instance
   */
  static createFresh(config: EvaluationServiceConfig): EvaluationService {
    return new EvaluationService(config);
  }
}
