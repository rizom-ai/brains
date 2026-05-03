import type { IAgentService, IAIService } from "@brains/ai-service";

import type {
  IEvaluationService,
  ITestCaseLoader,
  IReporter,
  EvaluationOptions,
  TestRunnerOptions,
} from "./types";
import type {
  TestCase,
  AgentTestCase,
  PluginTestCase,
  EvaluationResult,
  EvaluationSummary,
  QualityScores,
} from "./schemas";
import { TestRunner } from "./test-runner";
import { LLMJudge } from "./llm-judge";
import { PluginLLMJudge } from "./plugin-llm-judge";
import { YAMLLoader } from "./loaders/yaml-loader";
import { PluginRunner } from "./plugin-runner";
import type { EvalHandlerRegistry } from "./eval-handler-registry";

const DEFAULT_MAX_PARALLEL = 3;

/**
 * Type guard to check if a test case is an agent test case
 */
function isAgentTestCase(testCase: TestCase): testCase is AgentTestCase {
  return testCase.type !== "plugin";
}

/**
 * Type guard to check if a test case is a plugin test case
 */
function isPluginTestCase(testCase: TestCase): testCase is PluginTestCase {
  return testCase.type === "plugin";
}

/**
 * Configuration for the evaluation service
 */
export interface EvaluationServiceConfig {
  agentService: IAgentService;
  aiService: IAIService;
  testCasesDirectory: string | string[];
  reporters?: IReporter[];
  evalHandlerRegistry: EvalHandlerRegistry;
}

/**
 * Main orchestration service for running evaluations
 */
export class EvaluationService implements IEvaluationService {
  private readonly agentService: IAgentService;
  private readonly aiService: IAIService;
  private readonly loader: ITestCaseLoader;
  private readonly reporters: IReporter[];
  private readonly evalHandlerRegistry: EvalHandlerRegistry;

  constructor(config: EvaluationServiceConfig) {
    this.agentService = config.agentService;
    this.aiService = config.aiService;
    this.loader = YAMLLoader.createFresh({
      directory: config.testCasesDirectory,
      recursive: true,
    });
    this.reporters = config.reporters ?? [];
    this.evalHandlerRegistry = config.evalHandlerRegistry;
  }

  /**
   * Run evaluations against test cases
   */
  async runEvaluations(
    options: EvaluationOptions = {},
  ): Promise<EvaluationSummary> {
    const testCases = await this.getFilteredTestCases(options);
    const agentTestCases = this.getAgentTestCases(testCases, options);
    const pluginTestCases = this.getPluginTestCases(testCases, options);

    const results = [
      ...(await this.runAgentTests(agentTestCases, options)),
      ...(await this.runPluginTests(pluginTestCases, options)),
    ];

    const summary = this.generateSummary(results);
    await this.report(summary);

    return summary;
  }

  /**
   * List available test cases
   */
  async listTestCases(tags?: string[]): Promise<TestCase[]> {
    return this.filterByTags(await this.loader.loadTestCases(), tags);
  }

  /**
   * Add a reporter
   */
  addReporter(reporter: IReporter): void {
    this.reporters.push(reporter);
  }

  /**
   * Load and filter test cases by shared evaluation options.
   */
  private async getFilteredTestCases(
    options: EvaluationOptions,
  ): Promise<TestCase[]> {
    let testCases = await this.loader.loadTestCases();

    if (options.testCaseIds?.length) {
      testCases = this.filterByIds(testCases, options.testCaseIds);
    }

    return this.filterByTags(testCases, options.tags);
  }

  private filterByIds(testCases: TestCase[], ids: string[]): TestCase[] {
    const idSet = new Set(ids);
    return testCases.filter((testCase) => idSet.has(testCase.id));
  }

  private filterByTags(
    testCases: TestCase[],
    tags: string[] | undefined,
  ): TestCase[] {
    if (!tags?.length) return testCases;

    const tagSet = new Set(tags);
    return testCases.filter((testCase) =>
      testCase.tags?.some((tag) => tagSet.has(tag)),
    );
  }

  private getAgentTestCases(
    testCases: TestCase[],
    options: EvaluationOptions,
  ): AgentTestCase[] {
    return options.testType === "plugin"
      ? []
      : testCases.filter(isAgentTestCase);
  }

  private getPluginTestCases(
    testCases: TestCase[],
    options: EvaluationOptions,
  ): PluginTestCase[] {
    return options.testType === "agent"
      ? []
      : testCases.filter(isPluginTestCase);
  }

  /**
   * Run agent tests, optionally in parallel with a concurrency limit.
   */
  private async runAgentTests(
    testCases: AgentTestCase[],
    options: EvaluationOptions,
  ): Promise<EvaluationResult[]> {
    if (testCases.length === 0) return [];

    const testRunner = TestRunner.createFresh(
      this.agentService,
      this.createLLMJudge(options),
    );
    const runnerOptions = this.getRunnerOptions(options);

    if (options.parallel) {
      return this.runParallel(testCases, options, (testCase) =>
        testRunner.runTest(testCase, runnerOptions),
      );
    }

    const results: EvaluationResult[] = [];
    for (const testCase of testCases) {
      results.push(await testRunner.runTest(testCase, runnerOptions));
    }
    return results;
  }

  /**
   * Run plugin tests sequentially.
   */
  private async runPluginTests(
    testCases: PluginTestCase[],
    options: EvaluationOptions,
  ): Promise<EvaluationResult[]> {
    if (testCases.length === 0) return [];

    const pluginRunner = PluginRunner.createFresh(
      this.evalHandlerRegistry,
      this.createPluginLLMJudge(options),
    );
    const runnerOptions = this.getRunnerOptions(options);
    const results: EvaluationResult[] = [];

    for (const testCase of testCases) {
      results.push(await pluginRunner.runTest(testCase, runnerOptions));
    }

    return results;
  }

  private createLLMJudge(options: EvaluationOptions): LLMJudge | undefined {
    if (options.skipLLMJudge) return undefined;

    return LLMJudge.createFresh(
      this.aiService,
      this.getLLMJudgeOptions(options),
    );
  }

  private createPluginLLMJudge(
    options: EvaluationOptions,
  ): PluginLLMJudge | undefined {
    if (options.skipLLMJudge) return undefined;

    return PluginLLMJudge.createFresh(
      this.aiService,
      this.getLLMJudgeOptions(options),
    );
  }

  private getLLMJudgeOptions(
    options: EvaluationOptions,
  ): { sampleRate: number } | undefined {
    return options.llmJudgeSampleRate !== undefined
      ? { sampleRate: options.llmJudgeSampleRate }
      : undefined;
  }

  private getRunnerOptions(
    options: EvaluationOptions,
  ): TestRunnerOptions | undefined {
    return options.skipLLMJudge !== undefined
      ? { skipLLMJudge: options.skipLLMJudge }
      : undefined;
  }

  /**
   * Run test cases in parallel with a concurrency limit while preserving order.
   */
  private async runParallel<TTestCase extends TestCase>(
    testCases: TTestCase[],
    options: EvaluationOptions,
    runTest: (testCase: TTestCase) => Promise<EvaluationResult>,
  ): Promise<EvaluationResult[]> {
    const maxParallel = Math.max(
      1,
      options.maxParallel ?? DEFAULT_MAX_PARALLEL,
    );
    const workerCount = Math.min(maxParallel, testCases.length);
    const results = new Array<EvaluationResult>(testCases.length);
    let nextIndex = 0;

    const workers = Array.from({ length: workerCount }, async () => {
      while (nextIndex < testCases.length) {
        const currentIndex = nextIndex;
        nextIndex += 1;

        const testCase = testCases[currentIndex];
        if (!testCase) continue;

        results[currentIndex] = await runTest(testCase);
      }
    });

    await Promise.all(workers);
    return results;
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

  private async report(summary: EvaluationSummary): Promise<void> {
    for (const reporter of this.reporters) {
      await reporter.report(summary);
    }
  }

  /**
   * Create a fresh evaluation service instance
   */
  static createFresh(config: EvaluationServiceConfig): EvaluationService {
    return new EvaluationService(config);
  }
}
