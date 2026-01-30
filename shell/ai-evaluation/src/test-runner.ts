import type {
  IAgentService,
  ChatContext,
  AgentResponse,
} from "@brains/agent-service";
import type { UserPermissionLevel } from "@brains/permission-service";
import { randomUUID } from "crypto";

import type { ITestRunner, ILLMJudge, TestRunnerOptions } from "./types";
import type {
  AgentTestCase,
  EvaluationResult,
  TurnResult,
  FailureDetail,
  SuccessCriteria,
  ToolCallRecord,
} from "./schemas";
import { MetricCollector } from "./metric-collector";

/**
 * Runs individual test cases against an agent service
 */
export class TestRunner implements ITestRunner {
  private agentService: IAgentService;
  private llmJudge: ILLMJudge | null;

  constructor(agentService: IAgentService, llmJudge?: ILLMJudge) {
    this.agentService = agentService;
    this.llmJudge = llmJudge ?? null;
  }

  /**
   * Run a single test case (agent-based test cases only)
   */
  async runTest(
    testCase: AgentTestCase,
    options: TestRunnerOptions = {},
  ): Promise<EvaluationResult> {
    const conversationId = randomUUID();
    const collector = MetricCollector.createFresh();
    const turnResults: TurnResult[] = [];
    const failures: FailureDetail[] = [];

    // Build chat context from test setup
    const context: ChatContext = {
      userPermissionLevel: (testCase.setup?.permissionLevel ??
        "anchor") as UserPermissionLevel,
      interfaceType: "evaluation",
    };

    // Execute each turn
    for (let i = 0; i < testCase.turns.length; i++) {
      const turn = testCase.turns[i];
      if (!turn) continue;

      collector.startTurn();
      const response = await this.agentService.chat(
        turn.userMessage,
        conversationId,
        context,
      );
      const toolResultsForMetrics =
        response.toolResults?.map((tr) => ({
          toolName: tr.toolName,
          args: tr.args ?? ({} as Record<string, unknown>),
          result: tr.data,
        })) ?? [];
      const metrics = collector.endTurn({
        usage: response.usage,
        toolResults: toolResultsForMetrics,
      });

      const toolCalls = collector.getToolCallsForTurn(i);

      // Evaluate per-turn criteria if specified
      const turnCriteriaResults = turn.successCriteria
        ? this.evaluateCriteria(turn.successCriteria, response, toolCalls)
        : [];

      turnResults.push({
        turnIndex: i,
        userMessage: turn.userMessage,
        assistantResponse: response.text,
        toolCalls,
        metrics,
        criteriaResults: turnCriteriaResults.map((r) => ({
          criterion: r.criterion,
          passed: r.passed,
          details: r.message,
        })),
      });

      // Collect per-turn failures
      for (const result of turnCriteriaResults) {
        if (!result.passed) {
          failures.push(result);
        }
      }
    }

    // Evaluate final success criteria
    const allToolCalls = collector.getAllToolCalls();
    const lastResponse = turnResults[turnResults.length - 1];
    const finalCriteriaResults = this.evaluateCriteria(
      testCase.successCriteria,
      {
        text: lastResponse?.assistantResponse ?? "",
        usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      },
      allToolCalls,
    );

    for (const result of finalCriteriaResults) {
      if (!result.passed) {
        failures.push(result);
      }
    }

    // Evaluate efficiency criteria
    const totalMetrics = collector.getTotalMetrics();
    const efficiencyFailures = this.evaluateEfficiency(testCase, totalMetrics);

    // Get quality scores from LLM judge if available and not skipped
    let qualityScores = undefined;
    if (this.llmJudge && !options.skipLLMJudge) {
      qualityScores =
        (await this.llmJudge.scoreConversation(testCase, turnResults)) ??
        undefined;

      // Check quality score thresholds
      if (qualityScores) {
        const qualityFailures = this.evaluateQualityThresholds(
          testCase.successCriteria,
          qualityScores,
        );
        failures.push(...qualityFailures);
      }
    }

    const passed = failures.length === 0 && efficiencyFailures.length === 0;

    return {
      testCaseId: testCase.id,
      testCaseName: testCase.name,
      passed,
      timestamp: new Date().toISOString(),
      turnResults,
      totalMetrics,
      qualityScores,
      failures,
      efficiencyPassed: efficiencyFailures.length === 0,
      efficiencyFailures:
        efficiencyFailures.length > 0 ? efficiencyFailures : undefined,
    };
  }

  /**
   * Evaluate success criteria against response and tool calls
   */
  private evaluateCriteria(
    criteria: SuccessCriteria,
    response: { text: string; usage: AgentResponse["usage"] },
    toolCalls: ToolCallRecord[],
  ): Array<FailureDetail & { passed: boolean }> {
    const results: Array<FailureDetail & { passed: boolean }> = [];

    // Check expected tools
    if (criteria.expectedTools) {
      for (const expected of criteria.expectedTools) {
        const wasCalled = toolCalls.some(
          (tc) => tc.toolName === expected.toolName,
        );

        if (expected.shouldBeCalled && !wasCalled) {
          results.push({
            criterion: "expectedTool",
            expected: `Tool "${expected.toolName}" should be called`,
            actual: `Tool was not called. Called tools: ${toolCalls.map((tc) => tc.toolName).join(", ") || "none"}`,
            message: `Expected tool "${expected.toolName}" was not called`,
            passed: false,
          });
        } else if (!expected.shouldBeCalled && wasCalled) {
          results.push({
            criterion: "expectedTool",
            expected: `Tool "${expected.toolName}" should NOT be called`,
            actual: `Tool was called`,
            message: `Tool "${expected.toolName}" should not have been called`,
            passed: false,
          });
        } else {
          results.push({
            criterion: "expectedTool",
            expected: expected.shouldBeCalled ? "called" : "not called",
            actual: wasCalled ? "called" : "not called",
            passed: true,
          });
        }

        // Check args if specified - pass if ANY call to the tool has matching args
        if (expected.shouldBeCalled && wasCalled && expected.argsContain) {
          const matchingCalls = toolCalls.filter(
            (tc) => tc.toolName === expected.toolName,
          );

          for (const [key, expectedValue] of Object.entries(
            expected.argsContain,
          )) {
            // Check if ANY call has the expected arg value (use deep equality for arrays/objects)
            const anyCallMatches = matchingCalls.some(
              (tc) => tc.args && Bun.deepEquals(tc.args[key], expectedValue),
            );

            if (!anyCallMatches) {
              const actualValues = matchingCalls
                .map((tc) => tc.args?.[key])
                .filter((v) => v !== undefined);
              results.push({
                criterion: "toolArgsContain",
                expected: `${expected.toolName}.${key} = ${JSON.stringify(expectedValue)}`,
                actual: `${JSON.stringify(actualValues)} (across ${matchingCalls.length} calls)`,
                message: `Tool arg mismatch for ${expected.toolName}.${key}`,
                passed: false,
              });
            }
          }
        }
      }
    }

    // Check tool count range
    if (criteria.toolCountRange) {
      const count = toolCalls.length;
      if (
        criteria.toolCountRange.min !== undefined &&
        count < criteria.toolCountRange.min
      ) {
        results.push({
          criterion: "toolCountRange",
          expected: `>= ${criteria.toolCountRange.min} tool calls`,
          actual: count,
          message: `Too few tool calls: ${count} < ${criteria.toolCountRange.min}`,
          passed: false,
        });
      }
      if (
        criteria.toolCountRange.max !== undefined &&
        count > criteria.toolCountRange.max
      ) {
        results.push({
          criterion: "toolCountRange",
          expected: `<= ${criteria.toolCountRange.max} tool calls`,
          actual: count,
          message: `Too many tool calls: ${count} > ${criteria.toolCountRange.max}`,
          passed: false,
        });
      }
    }

    // Check response contains
    if (criteria.responseContains) {
      for (const expected of criteria.responseContains) {
        const contains = response.text
          .toLowerCase()
          .includes(expected.toLowerCase());
        if (!contains) {
          results.push({
            criterion: "responseContains",
            expected: `Response should contain "${expected}"`,
            actual: `Not found in response`,
            message: `Response does not contain expected text: "${expected}"`,
            passed: false,
          });
        }
      }
    }

    // Check response not contains
    if (criteria.responseNotContains) {
      for (const notExpected of criteria.responseNotContains) {
        const contains = response.text
          .toLowerCase()
          .includes(notExpected.toLowerCase());
        if (contains) {
          results.push({
            criterion: "responseNotContains",
            expected: `Response should NOT contain "${notExpected}"`,
            actual: `Found in response`,
            message: `Response contains unwanted text: "${notExpected}"`,
            passed: false,
          });
        }
      }
    }

    return results;
  }

  /**
   * Evaluate efficiency criteria
   */
  private evaluateEfficiency(
    testCase: AgentTestCase,
    metrics: { totalTokens: number; toolCallCount: number; durationMs: number },
  ): FailureDetail[] {
    const failures: FailureDetail[] = [];
    const efficiency = testCase.efficiency;

    if (!efficiency) return failures;

    if (
      efficiency.maxTokens !== undefined &&
      metrics.totalTokens > efficiency.maxTokens
    ) {
      failures.push({
        criterion: "maxTokens",
        expected: efficiency.maxTokens,
        actual: metrics.totalTokens,
        message: `Token usage ${metrics.totalTokens} exceeds max ${efficiency.maxTokens}`,
      });
    }

    if (
      efficiency.maxToolCalls !== undefined &&
      metrics.toolCallCount > efficiency.maxToolCalls
    ) {
      failures.push({
        criterion: "maxToolCalls",
        expected: efficiency.maxToolCalls,
        actual: metrics.toolCallCount,
        message: `Tool calls ${metrics.toolCallCount} exceeds max ${efficiency.maxToolCalls}`,
      });
    }

    if (
      efficiency.maxDurationMs !== undefined &&
      metrics.durationMs > efficiency.maxDurationMs
    ) {
      failures.push({
        criterion: "maxDurationMs",
        expected: efficiency.maxDurationMs,
        actual: metrics.durationMs,
        message: `Duration ${metrics.durationMs}ms exceeds max ${efficiency.maxDurationMs}ms`,
      });
    }

    return failures;
  }

  /**
   * Evaluate quality score thresholds
   */
  private evaluateQualityThresholds(
    criteria: SuccessCriteria,
    scores: {
      helpfulness: number;
      accuracy: number;
      instructionFollowing: number;
    },
  ): FailureDetail[] {
    const failures: FailureDetail[] = [];

    if (
      criteria.minHelpfulnessScore !== undefined &&
      scores.helpfulness < criteria.minHelpfulnessScore
    ) {
      failures.push({
        criterion: "minHelpfulnessScore",
        expected: criteria.minHelpfulnessScore,
        actual: scores.helpfulness,
        message: `Helpfulness score ${scores.helpfulness} below minimum ${criteria.minHelpfulnessScore}`,
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

    if (
      criteria.minInstructionFollowingScore !== undefined &&
      scores.instructionFollowing < criteria.minInstructionFollowingScore
    ) {
      failures.push({
        criterion: "minInstructionFollowingScore",
        expected: criteria.minInstructionFollowingScore,
        actual: scores.instructionFollowing,
        message: `Instruction following score ${scores.instructionFollowing} below minimum ${criteria.minInstructionFollowingScore}`,
      });
    }

    return failures;
  }

  /**
   * Create a fresh test runner instance
   */
  static createFresh(
    agentService: IAgentService,
    llmJudge?: ILLMJudge,
  ): TestRunner {
    return new TestRunner(agentService, llmJudge);
  }
}
