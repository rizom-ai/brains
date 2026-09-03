import { z } from "@brains/utils/zod";

type FailureDetailSchema = z.ZodObject<{
  criterion: z.ZodString;
  expected: z.ZodUnknown;
  actual: z.ZodUnknown;
  message: z.ZodOptional<z.ZodString>;
}>;

/**
 * Failure detail for a single criterion
 */
export const failureDetailSchema: FailureDetailSchema = z.object({
  criterion: z.string(),
  expected: z.unknown(),
  actual: z.unknown(),
  message: z.string().optional(),
});

export type FailureDetail = z.output<typeof failureDetailSchema>;

type ToolCallRecordSchema = z.ZodObject<{
  toolName: z.ZodString;
  args: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
  result: z.ZodOptional<z.ZodUnknown>;
}>;

/**
 * Tool call record from agent response
 */
export const toolCallRecordSchema: ToolCallRecordSchema = z.object({
  toolName: z.string(),
  args: z.record(z.string(), z.unknown()).optional(),
  result: z.unknown().optional(),
});

export type ToolCallRecord = z.output<typeof toolCallRecordSchema>;

type TurnMetricsSchema = z.ZodObject<{
  promptTokens: z.ZodNumber;
  completionTokens: z.ZodNumber;
  totalTokens: z.ZodNumber;
  toolCallCount: z.ZodNumber;
  durationMs: z.ZodNumber;
}>;

/**
 * Metrics for a single turn
 */
export const turnMetricsSchema: TurnMetricsSchema = z.object({
  promptTokens: z.number(),
  completionTokens: z.number(),
  totalTokens: z.number(),
  toolCallCount: z.number(),
  durationMs: z.number(),
});

export type TurnMetrics = z.output<typeof turnMetricsSchema>;

type TurnResultSchema = z.ZodObject<{
  turnIndex: z.ZodNumber;
  userMessage: z.ZodString;
  assistantResponse: z.ZodString;
  toolCalls: z.ZodArray<ToolCallRecordSchema>;
  metrics: TurnMetricsSchema;
  criteriaResults: z.ZodOptional<
    z.ZodArray<
      z.ZodObject<{
        criterion: z.ZodString;
        passed: z.ZodBoolean;
        details: z.ZodOptional<z.ZodString>;
      }>
    >
  >;
}>;

/**
 * Result for a single conversation turn
 */
export const turnResultSchema: TurnResultSchema = z.object({
  turnIndex: z.number(),
  userMessage: z.string(),
  assistantResponse: z.string(),
  toolCalls: z.array(toolCallRecordSchema),
  metrics: turnMetricsSchema,
  criteriaResults: z
    .array(
      z.object({
        criterion: z.string(),
        passed: z.boolean(),
        details: z.string().optional(),
      }),
    )
    .optional(),
});

export type TurnResult = z.output<typeof turnResultSchema>;
export type CriteriaResult = NonNullable<TurnResult["criteriaResults"]>[number];

type QualityScoresSchema = z.ZodObject<{
  helpfulness: z.ZodNumber;
  accuracy: z.ZodNumber;
  instructionFollowing: z.ZodNumber;
  appropriateToolUse: z.ZodOptional<z.ZodNumber>;
  reasoning: z.ZodOptional<z.ZodString>;
}>;

/**
 * Quality scores from LLM-as-judge
 */
export const qualityScoresSchema: QualityScoresSchema = z.object({
  helpfulness: z.number().min(0).max(5),
  accuracy: z.number().min(0).max(5),
  instructionFollowing: z.number().min(0).max(5),
  appropriateToolUse: z.number().min(0).max(5).optional(),
  reasoning: z.string().optional(),
});

export type QualityScores = z.output<typeof qualityScoresSchema>;

type TotalMetricsSchema = z.ZodObject<{
  promptTokens: z.ZodNumber;
  completionTokens: z.ZodNumber;
  totalTokens: z.ZodNumber;
  toolCallCount: z.ZodNumber;
  durationMs: z.ZodNumber;
  turnCount: z.ZodNumber;
}>;

/**
 * Aggregated metrics across all turns
 */
export const totalMetricsSchema: TotalMetricsSchema = z.object({
  promptTokens: z.number(),
  completionTokens: z.number(),
  totalTokens: z.number(),
  toolCallCount: z.number(),
  durationMs: z.number(),
  turnCount: z.number(),
});

export type TotalMetrics = z.output<typeof totalMetricsSchema>;

type EvaluationResultSchema = z.ZodObject<{
  testCaseId: z.ZodString;
  testCaseName: z.ZodString;
  passed: z.ZodBoolean;
  timestamp: z.ZodString;
  turnResults: z.ZodArray<TurnResultSchema>;
  totalMetrics: TotalMetricsSchema;
  qualityScores: z.ZodOptional<QualityScoresSchema>;
  failures: z.ZodArray<FailureDetailSchema>;
  efficiencyPassed: z.ZodOptional<z.ZodBoolean>;
  efficiencyFailures: z.ZodOptional<z.ZodArray<FailureDetailSchema>>;
  pluginOutput: z.ZodOptional<z.ZodUnknown>;
}>;

/**
 * Complete evaluation result
 */
export const evaluationResultSchema: EvaluationResultSchema = z.object({
  testCaseId: z.string(),
  testCaseName: z.string(),
  passed: z.boolean(),
  timestamp: z.string().datetime(),

  // Per-turn results
  turnResults: z.array(turnResultSchema),

  // Aggregated metrics
  totalMetrics: totalMetricsSchema,

  // Quality scores (optional, from LLM judge)
  qualityScores: qualityScoresSchema.optional(),

  // Failure details
  failures: z.array(failureDetailSchema),

  // Efficiency check results
  efficiencyPassed: z.boolean().optional(),
  efficiencyFailures: z.array(failureDetailSchema).optional(),

  // Plugin output (for plugin test cases)
  pluginOutput: z.unknown().optional(),
});

export type EvaluationResult = z.output<typeof evaluationResultSchema>;

type EvaluationSummarySchema = z.ZodObject<{
  timestamp: z.ZodString;
  totalTests: z.ZodNumber;
  passedTests: z.ZodNumber;
  failedTests: z.ZodNumber;
  passRate: z.ZodNumber;
  avgMetrics: z.ZodObject<{
    totalTokens: z.ZodNumber;
    toolCallCount: z.ZodNumber;
    durationMs: z.ZodNumber;
  }>;
  avgQualityScores: z.ZodOptional<QualityScoresSchema>;
  results: z.ZodArray<EvaluationResultSchema>;
}>;

/**
 * Summary of multiple evaluation runs
 */
export const evaluationSummarySchema: EvaluationSummarySchema = z.object({
  timestamp: z.string().datetime(),
  totalTests: z.number(),
  passedTests: z.number(),
  failedTests: z.number(),
  passRate: z.number(),

  // Average metrics
  avgMetrics: z.object({
    totalTokens: z.number(),
    toolCallCount: z.number(),
    durationMs: z.number(),
  }),

  // Average quality scores (if LLM judge was used)
  avgQualityScores: qualityScoresSchema.optional(),

  // Individual results
  results: z.array(evaluationResultSchema),
});

export type EvaluationSummary = z.output<typeof evaluationSummarySchema>;
export type EvaluationSummaryMetrics = EvaluationSummary["avgMetrics"];
