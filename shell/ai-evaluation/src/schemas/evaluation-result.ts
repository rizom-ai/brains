import { z } from "@brains/utils/zod-v4";

export interface FailureDetail {
  criterion: string;
  expected: unknown;
  actual: unknown;
  message?: string | undefined;
}

/**
 * Failure detail for a single criterion
 */
export const failureDetailSchema: z.ZodType<FailureDetail> = z.object({
  criterion: z.string(),
  expected: z.unknown(),
  actual: z.unknown(),
  message: z.string().optional(),
});

export interface ToolCallRecord {
  toolName: string;
  args?: Record<string, unknown> | undefined;
  result?: unknown;
}

/**
 * Tool call record from agent response
 */
export const toolCallRecordSchema: z.ZodType<ToolCallRecord> = z.object({
  toolName: z.string(),
  args: z.record(z.string(), z.unknown()).optional(),
  result: z.unknown().optional(),
});

export interface TurnMetrics {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  toolCallCount: number;
  durationMs: number;
}

/**
 * Metrics for a single turn
 */
export const turnMetricsSchema: z.ZodType<TurnMetrics> = z.object({
  promptTokens: z.number(),
  completionTokens: z.number(),
  totalTokens: z.number(),
  toolCallCount: z.number(),
  durationMs: z.number(),
});

export interface CriteriaResult {
  criterion: string;
  passed: boolean;
  details?: string | undefined;
}

export interface TurnResult {
  turnIndex: number;
  userMessage: string;
  assistantResponse: string;
  toolCalls: ToolCallRecord[];
  metrics: TurnMetrics;
  criteriaResults?: CriteriaResult[] | undefined;
}

/**
 * Result for a single conversation turn
 */
export const turnResultSchema: z.ZodType<TurnResult> = z.object({
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

export interface QualityScores {
  helpfulness: number;
  accuracy: number;
  instructionFollowing: number;
  appropriateToolUse?: number | undefined;
  reasoning?: string | undefined;
}

/**
 * Quality scores from LLM-as-judge
 */
export const qualityScoresSchema: z.ZodType<QualityScores> = z.object({
  helpfulness: z.number().min(0).max(5),
  accuracy: z.number().min(0).max(5),
  instructionFollowing: z.number().min(0).max(5),
  appropriateToolUse: z.number().min(0).max(5).optional(),
  reasoning: z.string().optional(),
});

export interface TotalMetrics {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  toolCallCount: number;
  durationMs: number;
  turnCount: number;
}

/**
 * Aggregated metrics across all turns
 */
export const totalMetricsSchema: z.ZodType<TotalMetrics> = z.object({
  promptTokens: z.number(),
  completionTokens: z.number(),
  totalTokens: z.number(),
  toolCallCount: z.number(),
  durationMs: z.number(),
  turnCount: z.number(),
});

export interface EvaluationResult {
  testCaseId: string;
  testCaseName: string;
  passed: boolean;
  timestamp: string;
  turnResults: TurnResult[];
  totalMetrics: TotalMetrics;
  qualityScores?: QualityScores | undefined;
  failures: FailureDetail[];
  efficiencyPassed?: boolean | undefined;
  efficiencyFailures?: FailureDetail[] | undefined;
  pluginOutput?: unknown;
}

/**
 * Complete evaluation result
 */
export const evaluationResultSchema: z.ZodType<EvaluationResult> = z.object({
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

export interface EvaluationSummaryMetrics {
  totalTokens: number;
  toolCallCount: number;
  durationMs: number;
}

export interface EvaluationSummary {
  timestamp: string;
  totalTests: number;
  passedTests: number;
  failedTests: number;
  passRate: number;
  avgMetrics: EvaluationSummaryMetrics;
  avgQualityScores?: QualityScores | undefined;
  results: EvaluationResult[];
}

/**
 * Summary of multiple evaluation runs
 */
export const evaluationSummarySchema: z.ZodType<EvaluationSummary> = z.object({
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
