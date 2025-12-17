import { z } from "@brains/utils";
import { UserPermissionLevelSchema } from "@brains/permission-service";

/**
 * Agent test case types (chat-based)
 */
export const agentTestCaseTypeSchema = z.enum([
  "tool_invocation", // Verifies correct tool calls
  "response_quality", // LLM-as-judge scoring
  "multi_turn", // Multi-message conversations
]);

export type AgentTestCaseType = z.infer<typeof agentTestCaseTypeSchema>;

/**
 * All test case types including plugin
 */
export const testCaseTypeSchema = z.enum([
  "tool_invocation",
  "response_quality",
  "multi_turn",
  "plugin", // Direct plugin functionality testing
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
 * Base test case fields shared by all types
 */
export const baseTestCaseSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  tags: z.array(z.string()).optional(),
});

/**
 * Agent test case definition (chat-based evaluations)
 */
export const agentTestCaseSchema = baseTestCaseSchema.extend({
  type: agentTestCaseTypeSchema,

  // Test setup
  setup: testSetupSchema.optional(),

  // Conversation turns
  turns: z.array(turnSchema).min(1),

  // Final success criteria (evaluated after all turns)
  successCriteria: successCriteriaSchema,

  // Efficiency expectations
  efficiency: efficiencySchema.optional(),
});

export type AgentTestCase = z.infer<typeof agentTestCaseSchema>;

/**
 * Validation check for a specific path in the output
 */
export const pathValidationSchema = z.object({
  path: z.string(), // JSONPath-like: "[0].sources[0].type"
  equals: z.unknown().optional(),
  matches: z.string().optional(), // Regex pattern
  exists: z.boolean().optional(),
});

export type PathValidation = z.infer<typeof pathValidationSchema>;

/**
 * Content check for items in an array
 * Supports either:
 * - `pattern`: Regex pattern for complex matching
 * - `words`: Array of words (auto-applies word boundaries)
 */
export const itemsContainSchema = z
  .object({
    field: z.string(),
    pattern: z.string().optional(), // Regex pattern
    words: z.array(z.string()).optional(), // Words with auto word-boundaries
  })
  .refine((data) => data.pattern !== undefined || data.words !== undefined, {
    message: "Either 'pattern' or 'words' must be provided",
  });

export type ItemsContain = z.infer<typeof itemsContainSchema>;

/**
 * Quality criteria for plugin tests (LLM-as-judge thresholds)
 */
export const pluginQualityCriteriaSchema = z.object({
  minRelevanceScore: z.number().min(0).max(5).optional(),
  minAccuracyScore: z.number().min(0).max(5).optional(),
  minCoverageScore: z.number().min(0).max(5).optional(),
  minQualityScore: z.number().min(0).max(5).optional(),
  // Custom evaluation prompt for context-aware and style checks
  evaluationPrompt: z.string().optional(),
});

export type PluginQualityCriteria = z.infer<typeof pluginQualityCriteriaSchema>;

/**
 * Expected output schema for plugin test cases
 */
export const expectedOutputSchema = z.object({
  // Array count validation
  minItems: z.number().optional(),
  maxItems: z.number().optional(),
  exactItems: z.number().optional(),

  // Array content validation - check if any item matches
  itemsContain: z.array(itemsContainSchema).optional(),

  // Array content validation - check that NO item matches (negative assertion)
  itemsNotContain: z.array(itemsContainSchema).optional(),

  // Array structure validation - check specific paths
  validateEach: z.array(pathValidationSchema).optional(),

  // Quality criteria (LLM-as-judge thresholds)
  qualityCriteria: pluginQualityCriteriaSchema.optional(),
});

export type ExpectedOutput = z.infer<typeof expectedOutputSchema>;

/**
 * Plugin test case definition (direct plugin functionality testing)
 */
export const pluginTestCaseSchema = baseTestCaseSchema.extend({
  type: z.literal("plugin"),

  // Plugin identifier
  plugin: z.string(),

  // Handler identifier within the plugin
  handler: z.string(),

  // Input to pass to the handler
  input: z.record(z.unknown()),

  // Expected output validation
  expectedOutput: expectedOutputSchema,
});

export type PluginTestCase = z.infer<typeof pluginTestCaseSchema>;

/**
 * Combined test case schema (discriminated union)
 */
export const testCaseSchema = z.discriminatedUnion("type", [
  agentTestCaseSchema.extend({ type: z.literal("tool_invocation") }),
  agentTestCaseSchema.extend({ type: z.literal("response_quality") }),
  agentTestCaseSchema.extend({ type: z.literal("multi_turn") }),
  pluginTestCaseSchema,
]);

export type TestCase = z.infer<typeof testCaseSchema>;

/**
 * Legacy test case schema for backward compatibility
 * @deprecated Use testCaseSchema instead
 */
export const legacyTestCaseSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  type: testCaseTypeSchema,
  tags: z.array(z.string()).optional(),
  setup: testSetupSchema.optional(),
  turns: z.array(turnSchema).min(1),
  successCriteria: successCriteriaSchema,
  efficiency: efficiencySchema.optional(),
});
