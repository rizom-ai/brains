import type {
  PluginTestCase,
  EvaluationResult,
  FailureDetail,
} from "./schemas";
import type { IEvalHandlerRegistry } from "./types";
import { OutputValidator } from "./output-validator";
import type { IPluginLLMJudge } from "./plugin-llm-judge";

/**
 * Options for running a plugin test
 */
export interface PluginRunnerOptions {
  /** Skip LLM-as-judge scoring */
  skipLLMJudge?: boolean;
}

/**
 * Runs plugin test cases against registered eval handlers
 */
export class PluginRunner {
  private registry: IEvalHandlerRegistry;
  private validator: OutputValidator;
  private llmJudge: IPluginLLMJudge | undefined;

  constructor(registry: IEvalHandlerRegistry, llmJudge?: IPluginLLMJudge) {
    this.registry = registry;
    this.validator = OutputValidator.createFresh();
    this.llmJudge = llmJudge;
  }

  /**
   * Run a single plugin test case
   */
  async runTest(
    testCase: PluginTestCase,
    options: PluginRunnerOptions = {},
  ): Promise<EvaluationResult> {
    const startTime = Date.now();

    // Get the handler
    const handler = this.registry.get(testCase.plugin, testCase.handler);

    if (!handler) {
      return {
        testCaseId: testCase.id,
        testCaseName: testCase.name,
        passed: false,
        timestamp: new Date().toISOString(),
        turnResults: [],
        totalMetrics: {
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0,
          toolCallCount: 0,
          durationMs: Date.now() - startTime,
          turnCount: 0,
        },
        failures: [
          {
            criterion: "handlerExists",
            expected: `${testCase.plugin}:${testCase.handler}`,
            actual: "not found",
            message: `Handler "${testCase.plugin}:${testCase.handler}" not registered`,
          },
        ],
      };
    }

    try {
      // Execute the handler
      const output = await handler(testCase.input);
      const durationMs = Date.now() - startTime;

      // Validate the output
      const failures = this.validator.validate(output, testCase.expectedOutput);

      // Run LLM judge if available and not skipped
      let qualityScores = undefined;
      if (this.llmJudge && !options.skipLLMJudge) {
        qualityScores =
          (await this.llmJudge.scorePluginOutput(testCase, output)) ??
          undefined;

        // Check quality criteria if scores were returned
        if (qualityScores && testCase.expectedOutput.qualityCriteria) {
          const qualityFailures = this.checkQualityCriteria(
            qualityScores,
            testCase.expectedOutput.qualityCriteria,
          );
          failures.push(...qualityFailures);
        }
      }

      const passed = failures.length === 0;

      return {
        testCaseId: testCase.id,
        testCaseName: testCase.name,
        passed,
        timestamp: new Date().toISOString(),
        turnResults: [],
        totalMetrics: {
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0,
          toolCallCount: 1,
          durationMs,
          turnCount: 0,
        },
        failures,
        qualityScores,
        // Store the actual output for debugging
        pluginOutput: output,
      };
    } catch (error) {
      const durationMs = Date.now() - startTime;
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      return {
        testCaseId: testCase.id,
        testCaseName: testCase.name,
        passed: false,
        timestamp: new Date().toISOString(),
        turnResults: [],
        totalMetrics: {
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0,
          toolCallCount: 0,
          durationMs,
          turnCount: 0,
        },
        failures: [
          {
            criterion: "handlerExecution",
            expected: "successful execution",
            actual: errorMessage,
            message: `Handler threw error: ${errorMessage}`,
          },
        ],
      };
    }
  }

  /**
   * Check quality criteria thresholds
   */
  private checkQualityCriteria(
    scores: {
      helpfulness: number;
      accuracy: number;
      instructionFollowing: number;
      appropriateToolUse?: number | undefined;
      reasoning?: string | undefined;
    },
    criteria: {
      minRelevanceScore?: number | undefined;
      minAccuracyScore?: number | undefined;
      minCoverageScore?: number | undefined;
      minQualityScore?: number | undefined;
    },
  ): FailureDetail[] {
    const failures: FailureDetail[] = [];

    // instructionFollowing maps to relevance in plugin context
    if (
      criteria.minRelevanceScore !== undefined &&
      scores.instructionFollowing < criteria.minRelevanceScore
    ) {
      failures.push({
        criterion: "minRelevanceScore",
        expected: criteria.minRelevanceScore,
        actual: scores.instructionFollowing,
        message: `Relevance score ${scores.instructionFollowing} below minimum ${criteria.minRelevanceScore}`,
      });
    }

    if (
      criteria.minAccuracyScore !== undefined &&
      scores.accuracy < criteria.minAccuracyScore
    ) {
      failures.push({
        criterion: "minAccuracyScore",
        expected: criteria.minAccuracyScore,
        actual: scores.accuracy,
        message: `Accuracy score ${scores.accuracy} below minimum ${criteria.minAccuracyScore}`,
      });
    }

    // helpfulness maps to coverage in plugin context
    if (
      criteria.minCoverageScore !== undefined &&
      scores.helpfulness < criteria.minCoverageScore
    ) {
      failures.push({
        criterion: "minCoverageScore",
        expected: criteria.minCoverageScore,
        actual: scores.helpfulness,
        message: `Coverage score ${scores.helpfulness} below minimum ${criteria.minCoverageScore}`,
      });
    }

    // appropriateToolUse maps to quality in plugin context
    if (
      criteria.minQualityScore !== undefined &&
      scores.appropriateToolUse !== undefined &&
      scores.appropriateToolUse < criteria.minQualityScore
    ) {
      failures.push({
        criterion: "minQualityScore",
        expected: criteria.minQualityScore,
        actual: scores.appropriateToolUse,
        message: `Quality score ${scores.appropriateToolUse} below minimum ${criteria.minQualityScore}`,
      });
    }

    return failures;
  }

  /**
   * Create a fresh instance
   */
  static createFresh(
    registry: IEvalHandlerRegistry,
    llmJudge?: IPluginLLMJudge,
  ): PluginRunner {
    return new PluginRunner(registry, llmJudge);
  }
}
