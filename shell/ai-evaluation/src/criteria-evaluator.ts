import { z } from "@brains/utils/zod";
import type {
  AgentTestCase,
  FailureDetail,
  QualityScores,
  SuccessCriteria,
  ToolCallRecord,
  TotalMetrics,
} from "./schemas";

const recordSchema = z.record(z.string(), z.unknown());

export type CriteriaEvaluationResult = FailureDetail & { passed: boolean };

interface ResponseForCriteria {
  text: string;
}

type EfficiencyMetrics = Pick<
  TotalMetrics,
  "totalTokens" | "toolCallCount" | "durationMs"
>;

type QualityThresholdScores = Pick<
  QualityScores,
  "helpfulness" | "accuracy" | "instructionFollowing"
>;

/**
 * Evaluate success criteria against response and tool calls.
 */
export function evaluateCriteria(
  criteria: SuccessCriteria,
  response: ResponseForCriteria,
  toolCalls: ToolCallRecord[],
): CriteriaEvaluationResult[] {
  return [
    ...evaluateExpectedTools(criteria, toolCalls),
    ...evaluateExpectedAnyTool(criteria, toolCalls),
    ...evaluateToolCountRange(criteria, toolCalls),
    ...evaluateResponseContains(criteria, response.text),
    ...evaluateResponseContainsAny(criteria, response.text),
    ...evaluateResponseNotContains(criteria, response.text),
  ];
}

/**
 * Evaluate efficiency criteria.
 */
export function evaluateEfficiency(
  testCase: AgentTestCase,
  metrics: EfficiencyMetrics,
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
 * Evaluate quality score thresholds.
 */
export function evaluateQualityThresholds(
  criteria: SuccessCriteria,
  scores: QualityThresholdScores,
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

function evaluateExpectedTools(
  criteria: SuccessCriteria,
  toolCalls: ToolCallRecord[],
): CriteriaEvaluationResult[] {
  const results: CriteriaEvaluationResult[] = [];

  if (!criteria.expectedTools) return results;

  for (const expected of criteria.expectedTools) {
    const matchingCalls = toolCalls.filter(
      (toolCall) => toolCall.toolName === expected.toolName,
    );
    const wasCalled = matchingCalls.length > 0;

    results.push(
      evaluateExpectedToolPresence(
        expected.toolName,
        expected.shouldBeCalled,
        wasCalled,
        toolCalls,
      ),
    );

    if (!expected.shouldBeCalled || !wasCalled) continue;

    if (expected.argsContain) {
      results.push(
        ...evaluateArgsContain(
          expected.toolName,
          expected.argsContain,
          matchingCalls,
        ),
      );
    }

    if (expected.argsAbsent) {
      results.push(
        ...evaluateArgsAbsent(
          expected.toolName,
          expected.argsAbsent,
          matchingCalls,
        ),
      );
    }
  }

  return results;
}

function evaluateExpectedAnyTool(
  criteria: SuccessCriteria,
  toolCalls: ToolCallRecord[],
): CriteriaEvaluationResult[] {
  const results: CriteriaEvaluationResult[] = [];

  if (!criteria.expectedAnyTool) return results;

  for (const expected of criteria.expectedAnyTool) {
    const matchingCalls = toolCalls.filter((toolCall) =>
      expected.toolNames.includes(toolCall.toolName),
    );
    const matchingNames = matchingCalls.map((toolCall) => toolCall.toolName);
    const argsMatchingCalls = expected.argsContain
      ? matchingCalls.filter((toolCall) =>
          argsContainMatches(toolCall.args, expected.argsContain ?? {}),
        )
      : matchingCalls;
    const wasCalled = argsMatchingCalls.length > 0;
    const toolList = expected.toolNames.join(", ");
    const argsLabel = expected.argsContain
      ? ` with args ${JSON.stringify(expected.argsContain)}`
      : "";

    if (expected.shouldBeCalled && !wasCalled) {
      results.push({
        criterion: "expectedAnyTool",
        expected: `One of [${toolList}]${argsLabel} should be called`,
        actual: expected.argsContain
          ? `Called matching tools: ${formatToolCallsForArgs(matchingCalls)}`
          : `Called tools: ${toolCalls.map((toolCall) => toolCall.toolName).join(", ") || "none"}`,
        message: `Expected one of [${toolList}]${argsLabel} was not called`,
        passed: false,
      });
      continue;
    }

    if (!expected.shouldBeCalled && wasCalled) {
      results.push({
        criterion: "expectedAnyTool",
        expected: `None of [${toolList}]${argsLabel} should be called`,
        actual: `Called matching tools: ${argsMatchingCalls.map((toolCall) => toolCall.toolName).join(", ")}`,
        message: `One of [${toolList}]${argsLabel} should not have been called`,
        passed: false,
      });
      continue;
    }

    results.push({
      criterion: "expectedAnyTool",
      expected: expected.shouldBeCalled ? "one called" : "none called",
      actual: matchingNames.length > 0 ? "one called" : "none called",
      passed: true,
    });
  }

  return results;
}

function argsContainMatches(
  args: Record<string, unknown> | undefined,
  argsContain: Record<string, unknown>,
): boolean {
  if (!args) return false;
  return Object.entries(argsContain).every(([key, expectedValue]) =>
    Bun.deepEquals(resolveDottedPath(args, key), expectedValue),
  );
}

function formatToolCallsForArgs(toolCalls: ToolCallRecord[]): string {
  if (toolCalls.length === 0) return "none";
  return JSON.stringify(
    toolCalls.map((toolCall) => ({
      toolName: toolCall.toolName,
      args: toolCall.args ?? {},
    })),
  );
}

function evaluateExpectedToolPresence(
  toolName: string,
  shouldBeCalled: boolean,
  wasCalled: boolean,
  toolCalls: ToolCallRecord[],
): CriteriaEvaluationResult {
  if (shouldBeCalled && !wasCalled) {
    return {
      criterion: "expectedTool",
      expected: `Tool "${toolName}" should be called`,
      actual: `Tool was not called. Called tools: ${toolCalls.map((toolCall) => toolCall.toolName).join(", ") || "none"}`,
      message: `Expected tool "${toolName}" was not called`,
      passed: false,
    };
  }

  if (!shouldBeCalled && wasCalled) {
    return {
      criterion: "expectedTool",
      expected: `Tool "${toolName}" should NOT be called`,
      actual: "Tool was called",
      message: `Tool "${toolName}" should not have been called`,
      passed: false,
    };
  }

  return {
    criterion: "expectedTool",
    expected: shouldBeCalled ? "called" : "not called",
    actual: wasCalled ? "called" : "not called",
    passed: true,
  };
}

function evaluateArgsContain(
  toolName: string,
  argsContain: Record<string, unknown>,
  matchingCalls: ToolCallRecord[],
): CriteriaEvaluationResult[] {
  const results: CriteriaEvaluationResult[] = [];

  for (const [key, expectedValue] of Object.entries(argsContain)) {
    const anyCallMatches = matchingCalls.some(
      (toolCall) =>
        toolCall.args &&
        Bun.deepEquals(resolveDottedPath(toolCall.args, key), expectedValue),
    );

    if (!anyCallMatches) {
      results.push({
        criterion: "toolArgsContain",
        expected: `${toolName}.${key} = ${JSON.stringify(expectedValue)}`,
        actual: `${JSON.stringify(collectActualValues(matchingCalls, key))} (across ${matchingCalls.length} calls)`,
        message: `Tool arg mismatch for ${toolName}.${key}`,
        passed: false,
      });
    }
  }

  return results;
}

function evaluateArgsAbsent(
  toolName: string,
  argsAbsent: string[],
  matchingCalls: ToolCallRecord[],
): CriteriaEvaluationResult[] {
  const results: CriteriaEvaluationResult[] = [];

  for (const key of argsAbsent) {
    const actualValues = collectActualValues(matchingCalls, key, {
      ignoreEmpty: true,
    });

    if (actualValues.length > 0) {
      results.push({
        criterion: "toolArgsAbsent",
        expected: `${toolName}.${key} absent`,
        actual: `${JSON.stringify(actualValues)} (across ${matchingCalls.length} calls)`,
        message: `Tool arg should be absent for ${toolName}.${key}`,
        passed: false,
      });
    }
  }

  return results;
}

function evaluateToolCountRange(
  criteria: SuccessCriteria,
  toolCalls: ToolCallRecord[],
): CriteriaEvaluationResult[] {
  const results: CriteriaEvaluationResult[] = [];
  const range = criteria.toolCountRange;

  if (!range) return results;

  const count = toolCalls.length;
  if (range.min !== undefined && count < range.min) {
    results.push({
      criterion: "toolCountRange",
      expected: `>= ${range.min} tool calls`,
      actual: count,
      message: `Too few tool calls: ${count} < ${range.min}`,
      passed: false,
    });
  }

  if (range.max !== undefined && count > range.max) {
    results.push({
      criterion: "toolCountRange",
      expected: `<= ${range.max} tool calls`,
      actual: count,
      message: `Too many tool calls: ${count} > ${range.max}`,
      passed: false,
    });
  }

  return results;
}

function evaluateResponseContains(
  criteria: SuccessCriteria,
  responseText: string,
): CriteriaEvaluationResult[] {
  const results: CriteriaEvaluationResult[] = [];

  if (!criteria.responseContains) return results;

  for (const expected of criteria.responseContains) {
    const contains = responseText
      .toLowerCase()
      .includes(expected.toLowerCase());
    if (!contains) {
      results.push({
        criterion: "responseContains",
        expected: `Response should contain "${expected}"`,
        actual: "Not found in response",
        message: `Response does not contain expected text: "${expected}"`,
        passed: false,
      });
    }
  }

  return results;
}

function evaluateResponseContainsAny(
  criteria: SuccessCriteria,
  responseText: string,
): CriteriaEvaluationResult[] {
  const results: CriteriaEvaluationResult[] = [];

  if (!criteria.responseContainsAny) return results;

  const normalizedResponse = responseText.toLowerCase();
  for (const alternatives of criteria.responseContainsAny) {
    const matched = alternatives.some((expected) =>
      normalizedResponse.includes(expected.toLowerCase()),
    );
    if (matched) {
      results.push({
        criterion: "responseContainsAny",
        expected: `Response should contain one of ${formatAlternatives(alternatives)}`,
        actual: "Found in response",
        passed: true,
      });
      continue;
    }

    results.push({
      criterion: "responseContainsAny",
      expected: `Response should contain one of ${formatAlternatives(alternatives)}`,
      actual: "Not found in response",
      message: `Response does not contain any expected text: ${formatAlternatives(alternatives)}`,
      passed: false,
    });
  }

  return results;
}

function formatAlternatives(alternatives: string[]): string {
  return alternatives.map((alternative) => `"${alternative}"`).join(" or ");
}

function evaluateResponseNotContains(
  criteria: SuccessCriteria,
  responseText: string,
): CriteriaEvaluationResult[] {
  const results: CriteriaEvaluationResult[] = [];

  if (!criteria.responseNotContains) return results;

  for (const notExpected of criteria.responseNotContains) {
    const contains = responseText
      .toLowerCase()
      .includes(notExpected.toLowerCase());
    if (contains) {
      results.push({
        criterion: "responseNotContains",
        expected: `Response should NOT contain "${notExpected}"`,
        actual: "Found in response",
        message: `Response contains unwanted text: "${notExpected}"`,
        passed: false,
      });
    }
  }

  return results;
}

function collectActualValues(
  matchingCalls: ToolCallRecord[],
  key: string,
  options: { ignoreEmpty?: boolean } = {},
): unknown[] {
  return matchingCalls
    .map((toolCall) => toolCall.args && resolveDottedPath(toolCall.args, key))
    .filter(options.ignoreEmpty ? hasNonEmptyValue : isDefined);
}

function resolveDottedPath(
  obj: Record<string, unknown>,
  path: string,
): unknown {
  const parts = path.split(".");
  let current: unknown = obj;

  for (const part of parts) {
    const parsed = recordSchema.safeParse(current);
    if (!parsed.success) return undefined;
    current = parsed.data[part];
  }

  return current;
}

function hasNonEmptyValue(value: unknown): boolean {
  return (
    value !== undefined &&
    value !== null &&
    !(typeof value === "string" && value.trim().length === 0)
  );
}

function isDefined(value: unknown): boolean {
  return value !== undefined;
}
