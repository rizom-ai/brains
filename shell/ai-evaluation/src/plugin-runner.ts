import type { PluginTestCase, EvaluationResult } from "./schemas";
import type { IEvalHandlerRegistry } from "./types";
import { OutputValidator } from "./output-validator";

/**
 * Runs plugin test cases against registered eval handlers
 */
export class PluginRunner {
  private registry: IEvalHandlerRegistry;
  private validator: OutputValidator;

  constructor(registry: IEvalHandlerRegistry) {
    this.registry = registry;
    this.validator = OutputValidator.createFresh();
  }

  /**
   * Run a single plugin test case
   */
  async runTest(testCase: PluginTestCase): Promise<EvaluationResult> {
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
   * Create a fresh instance
   */
  static createFresh(registry: IEvalHandlerRegistry): PluginRunner {
    return new PluginRunner(registry);
  }
}
