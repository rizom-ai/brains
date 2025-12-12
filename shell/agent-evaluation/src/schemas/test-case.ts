import { z } from "@brains/utils";
import { UserPermissionLevelSchema } from "@brains/permission-service";

/**
 * Test case types
 */
export const testCaseTypeSchema = z.enum([
  "tool_invocation", // Verifies correct tool calls
  "response_quality", // LLM-as-judge scoring
  "multi_turn", // Multi-message conversations
]);

export type TestCaseType = z.infer<typeof testCaseTypeSchema>;

/**
 * Expected tool call definition
 */
export const expectedToolCallSchema = z.object({
  toolName: z.string(),
  argsContain: z.record(z.unknown()).optional(),
  shouldBeCalled: z.boolean().default(true),
});

export type ExpectedToolCall = z.infer<typeof expectedToolCallSchema>;

/**
 * Tool count range for efficiency checks
 */
export const toolCountRangeSchema = z.object({
  min: z.number().optional(),
  max: z.number().optional(),
});

export type ToolCountRange = z.infer<typeof toolCountRangeSchema>;

/**
 * Success criteria for evaluating test results
 */
export const successCriteriaSchema = z.object({
  // Tool-based criteria
  expectedTools: z.array(expectedToolCallSchema).optional(),
  toolCountRange: toolCountRangeSchema.optional(),

  // Response-based criteria
  responseContains: z.array(z.string()).optional(),
  responseNotContains: z.array(z.string()).optional(),

  // Quality thresholds (for LLM-as-judge)
  minHelpfulnessScore: z.number().min(0).max(5).optional(),
  minAccuracyScore: z.number().min(0).max(5).optional(),
  minInstructionFollowingScore: z.number().min(0).max(5).optional(),
});

export type SuccessCriteria = z.infer<typeof successCriteriaSchema>;

/**
 * Single conversation turn
 */
export const turnSchema = z.object({
  userMessage: z.string(),
  successCriteria: successCriteriaSchema.optional(),
});

export type Turn = z.infer<typeof turnSchema>;

/**
 * Test setup configuration
 */
export const testSetupSchema = z.object({
  permissionLevel: UserPermissionLevelSchema.default("anchor"),
});

export type TestSetup = z.infer<typeof testSetupSchema>;

/**
 * Efficiency expectations
 */
export const efficiencySchema = z.object({
  maxTokens: z.number().optional(),
  maxToolCalls: z.number().optional(),
  maxSteps: z.number().optional(),
  maxDurationMs: z.number().optional(),
});

export type Efficiency = z.infer<typeof efficiencySchema>;

/**
 * Complete test case definition
 */
export const testCaseSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  type: testCaseTypeSchema,
  tags: z.array(z.string()).optional(),

  // Test setup
  setup: testSetupSchema.optional(),

  // Conversation turns
  turns: z.array(turnSchema).min(1),

  // Final success criteria (evaluated after all turns)
  successCriteria: successCriteriaSchema,

  // Efficiency expectations
  efficiency: efficiencySchema.optional(),
});

export type TestCase = z.infer<typeof testCaseSchema>;
