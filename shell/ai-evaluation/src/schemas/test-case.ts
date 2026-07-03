import { z } from "@brains/utils/zod-v4";

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
  argsContain: z.record(z.string(), z.unknown()).optional(),
  argsAbsent: z
    .array(z.string())
    .optional()
    .describe(
      "Tool argument paths that must be absent from all matching calls",
    ),
  shouldBeCalled: z.boolean().default(true),
});

export type ExpectedToolCall = z.infer<typeof expectedToolCallSchema>;

export const expectedAnyToolCallSchema = z.object({
  toolNames: z.array(z.string()).min(1),
  argsContain: z.record(z.string(), z.unknown()).optional(),
  shouldBeCalled: z.boolean().default(true),
});

export type ExpectedAnyToolCall = z.infer<typeof expectedAnyToolCallSchema>;

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
  expectedAnyTool: z.array(expectedAnyToolCallSchema).optional(),
  toolCountRange: toolCountRangeSchema.optional(),

  // Response-based criteria
  responseContains: z.array(z.string()).optional(),
  responseContainsAny: z.array(z.array(z.string()).min(1)).optional(),
  responseNotContains: z.array(z.string()).optional(),

  // Quality thresholds (for LLM-as-judge)
  minHelpfulnessScore: z.number().min(0).max(5).optional(),
  minAccuracyScore: z.number().min(0).max(5).optional(),
  minInstructionFollowingScore: z.number().min(0).max(5).optional(),
});

export type SuccessCriteria = z.infer<typeof successCriteriaSchema>;

const evalAttachmentSourceSchema = z.object({
  kind: z.string().min(1),
  id: z.string().min(1),
});

const evalTextAttachmentSchema = z.object({
  kind: z.literal("text"),
  filename: z.string().min(1),
  mediaType: z.string().min(1),
  content: z.string(),
  sizeBytes: z.number().nonnegative().optional(),
  source: evalAttachmentSourceSchema.optional(),
});

const evalFileAttachmentSchema = z.object({
  kind: z.literal("file"),
  filename: z.string().min(1),
  mediaType: z.string().min(1),
  dataBase64: z.string().min(1),
  sizeBytes: z.number().nonnegative().optional(),
  source: evalAttachmentSourceSchema.optional(),
});

export const evalAttachmentSchema = z.discriminatedUnion("kind", [
  evalTextAttachmentSchema,
  evalFileAttachmentSchema,
]);

export type EvalAttachment = z.infer<typeof evalAttachmentSchema>;

const userPermissionLevelSchema = z.enum(["anchor", "trusted", "public"]);
const messageRoleSchema = z.enum(["user", "assistant"]);

const conversationMessageActorSchema = z.object({
  actorId: z.string(),
  canonicalId: z.string().optional(),
  interfaceType: z.string(),
  role: messageRoleSchema,
  displayName: z.string().optional(),
  username: z.string().optional(),
  isBot: z.boolean().optional(),
});

const conversationMessageSourceSchema = z.object({
  messageId: z.string().optional(),
  channelId: z.string().optional(),
  channelName: z.string().optional(),
  threadId: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const turnContextSchema = z
  .object({
    userPermissionLevel: userPermissionLevelSchema.optional(),
    interfaceType: z.string().optional(),
    channelId: z.string().optional(),
    channelName: z.string().optional(),
    actor: conversationMessageActorSchema.optional(),
    source: conversationMessageSourceSchema.optional(),
  })
  .partial();

export type TurnContext = z.infer<typeof turnContextSchema>;

/**
 * Single conversation turn
 */
export const turnSchema = z.object({
  userMessage: z.string(),
  confirmPendingAction: z
    .boolean()
    .optional()
    .describe(
      "When set, this turn resolves the pending confirmation instead of sending a chat message.",
    ),
  approvalId: z
    .string()
    .optional()
    .describe(
      "Explicit approval id to resolve when confirmPendingAction is set. Required when multiple confirmations are pending.",
    ),
  attachments: z
    .array(evalAttachmentSchema)
    .optional()
    .describe(
      "Native attachments to pass with this turn. File data is base64-encoded in YAML and decoded before AgentService.chat().",
    ),
  reusePreviousAttachments: z
    .boolean()
    .optional()
    .describe(
      "When true, passes the previous turn's attachments again with this turn, simulating interface-level deferred upload reuse.",
    ),
  context: turnContextSchema
    .optional()
    .describe(
      "Per-turn chat context override for multi-user conversations. Attachments stay on the turn attachments fields.",
    ),
  successCriteria: successCriteriaSchema.optional(),
});

export type Turn = z.infer<typeof turnSchema>;

/**
 * Test setup configuration
 */
export const testSetupSchema = z.object({
  permissionLevel: userPermissionLevelSchema.default("anchor"),
  interfaceType: z.string().optional(),
  channelId: z.string().optional(),
  channelName: z.string().optional(),
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

export const permissionMatrixSchema = z
  .object({
    public: successCriteriaSchema.optional(),
    trusted: successCriteriaSchema.optional(),
    anchor: successCriteriaSchema.optional(),
  })
  .partial();

export type PermissionMatrix = z.infer<typeof permissionMatrixSchema>;

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

  // Permission matrix expands one case into per-level runs.
  permissions: permissionMatrixSchema.optional(),

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
  input: z.record(z.string(), z.unknown()),

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
