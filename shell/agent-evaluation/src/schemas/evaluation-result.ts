import { z } from "@brains/utils";

/**
 * Failure detail for a single criterion
 */
export const failureDetailSchema = z.object({
  criterion: z.string(),
  expected: z.unknown(),
  actual: z.unknown(),
  message: z.string().optional(),
});

export type FailureDetail = z.infer<typeof failureDetailSchema>;

/**
 * Tool call record from agent response
 */
export const toolCallRecordSchema = z.object({
  toolName: z.string(),
  args: z.record(z.unknown()).optional(),
  result: z.unknown().optional(),
});

export type ToolCallRecord = z.infer<typeof toolCallRecordSchema>;

/**
 * Metrics for a single turn
 */
export const turnMetricsSchema = z.object({
  promptTokens: z.number(),
  completionTokens: z.number(),
  totalTokens: z.number(),
  toolCallCount: z.number(),
  durationMs: z.number(),
});

export type TurnMetrics = z.infer<typeof turnMetricsSchema>;

/**
 * Result for a single conversation turn
 */
export const turnResultSchema = z.object({
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

export type TurnResult = z.infer<typeof turnResultSchema>;

/**
 * Quality scores from LLM-as-judge
 */
export const qualityScoresSchema = z.object({
  helpfulness: z.number().min(0).max(5),
  accuracy: z.number().min(0).max(5),
  instructionFollowing: z.number().min(0).max(5),
  appropriateToolUse: z.number().min(0).max(5).optional(),
  reasoning: z.string().optional(),
});

export type QualityScores = z.infer<typeof qualityScoresSchema>;

/**
 * Aggregated metrics across all turns
 */
export const totalMetricsSchema = z.object({
  promptTokens: z.number(),
  completionTokens: z.number(),
  totalTokens: z.number(),
  toolCallCount: z.number(),
  durationMs: z.number(),
  turnCount: z.number(),
});

export type TotalMetrics = z.infer<typeof totalMetricsSchema>;

/**
 * Complete evaluation result
 */
export const evaluationResultSchema = z.object({
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
});

export type EvaluationResult = z.infer<typeof evaluationResultSchema>;

/**
 * Summary of multiple evaluation runs
 */
export const evaluationSummarySchema = z.object({
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

export type EvaluationSummary = z.infer<typeof evaluationSummarySchema>;
