import {
  conversationMessageActorSchema,
  conversationMessageMetadataSchema,
  conversationMessageSourceSchema,
} from "@brains/plugins";
import { z } from "@brains/utils/zod";

/**
 * Agent test case types (chat-based)
 */
export const agentTestCaseTypeSchema: z.ZodEnum<{
  tool_invocation: "tool_invocation";
  response_quality: "response_quality";
  multi_turn: "multi_turn";
}> = z.enum([
  "tool_invocation", // Verifies correct tool calls
  "response_quality", // LLM-as-judge scoring
  "multi_turn", // Multi-message conversations
]);

export type AgentTestCaseType = z.output<typeof agentTestCaseTypeSchema>;

/**
 * All test case types including plugin
 */
export const testCaseTypeSchema: z.ZodEnum<{
  tool_invocation: "tool_invocation";
  response_quality: "response_quality";
  multi_turn: "multi_turn";
  plugin: "plugin";
}> = z.enum([
  "tool_invocation",
  "response_quality",
  "multi_turn",
  "plugin", // Direct plugin functionality testing
]);

export type TestCaseType = z.output<typeof testCaseTypeSchema>;

type ExpectedToolCallSchema = z.ZodObject<{
  toolName: z.ZodString;
  argsContain: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
  argsAbsent: z.ZodOptional<z.ZodArray<z.ZodString>>;
  resultErrorContains: z.ZodOptional<z.ZodString>;
  resultRefused: z.ZodOptional<z.ZodBoolean>;
  shouldBeCalled: z.ZodDefault<z.ZodBoolean>;
}>;

/**
 * Expected tool call definition
 */
export const expectedToolCallSchema: ExpectedToolCallSchema = z.object({
  toolName: z.string(),
  argsContain: z.record(z.string(), z.unknown()).optional(),
  argsAbsent: z
    .array(z.string())
    .optional()
    .describe(
      "Tool argument paths that must be absent from all matching calls",
    ),
  resultErrorContains: z
    .string()
    .optional()
    .describe(
      "Every matching call must have been refused with an error containing this text. Use it to assert a server-side boundary rather than asking the model to decline the call.",
    ),
  resultRefused: z
    .boolean()
    .optional()
    .describe(
      "Whether every matching call must have been refused. shouldBeCalled alone only proves the model invoked the tool, so a denied write reads as a pass without this.",
    ),
  shouldBeCalled: z.boolean().default(true),
});

export type ExpectedToolCall = z.output<typeof expectedToolCallSchema>;

type ExpectedAnyToolCallSchema = z.ZodObject<{
  toolNames: z.ZodArray<z.ZodString>;
  argsContain: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
  shouldBeCalled: z.ZodDefault<z.ZodBoolean>;
}>;

export const expectedAnyToolCallSchema: ExpectedAnyToolCallSchema = z.object({
  toolNames: z.array(z.string()).min(1),
  argsContain: z.record(z.string(), z.unknown()).optional(),
  shouldBeCalled: z.boolean().default(true),
});

export type ExpectedAnyToolCall = z.output<typeof expectedAnyToolCallSchema>;

type ToolCountRangeSchema = z.ZodObject<{
  min: z.ZodOptional<z.ZodNumber>;
  max: z.ZodOptional<z.ZodNumber>;
}>;

/**
 * Tool count range for efficiency checks
 */
export const toolCountRangeSchema: ToolCountRangeSchema = z.object({
  min: z.number().optional(),
  max: z.number().optional(),
});

export type ToolCountRange = z.output<typeof toolCountRangeSchema>;

type SuccessCriteriaSchema = z.ZodObject<{
  expectedTools: z.ZodOptional<z.ZodArray<ExpectedToolCallSchema>>;
  expectedAnyTool: z.ZodOptional<z.ZodArray<ExpectedAnyToolCallSchema>>;
  toolCountRange: z.ZodOptional<ToolCountRangeSchema>;
  responseContains: z.ZodOptional<z.ZodArray<z.ZodString>>;
  responseContainsAny: z.ZodOptional<z.ZodArray<z.ZodArray<z.ZodString>>>;
  responseNotContains: z.ZodOptional<z.ZodArray<z.ZodString>>;
  minHelpfulnessScore: z.ZodOptional<z.ZodNumber>;
  minAccuracyScore: z.ZodOptional<z.ZodNumber>;
  minInstructionFollowingScore: z.ZodOptional<z.ZodNumber>;
}>;

/**
 * Success criteria for evaluating test results
 */
export const successCriteriaSchema: SuccessCriteriaSchema = z.object({
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

export type SuccessCriteria = z.output<typeof successCriteriaSchema>;

type EvalAttachmentSourceSchema = z.ZodObject<{
  kind: z.ZodString;
  id: z.ZodString;
}>;

const evalAttachmentSourceSchema: EvalAttachmentSourceSchema = z.object({
  kind: z.string().min(1),
  id: z.string().min(1),
});

export type EvalAttachmentSource = z.output<typeof evalAttachmentSourceSchema>;

type EvalTextAttachmentSchema = z.ZodObject<{
  kind: z.ZodLiteral<"text">;
  filename: z.ZodString;
  mediaType: z.ZodString;
  content: z.ZodString;
  sizeBytes: z.ZodOptional<z.ZodNumber>;
  source: z.ZodOptional<EvalAttachmentSourceSchema>;
}>;

const evalTextAttachmentSchema: EvalTextAttachmentSchema = z.object({
  kind: z.literal("text"),
  filename: z.string().min(1),
  mediaType: z.string().min(1),
  content: z.string(),
  sizeBytes: z.number().nonnegative().optional(),
  source: evalAttachmentSourceSchema.optional(),
});

export type EvalTextAttachment = z.output<typeof evalTextAttachmentSchema>;

type EvalFileAttachmentSchema = z.ZodObject<{
  kind: z.ZodLiteral<"file">;
  filename: z.ZodString;
  mediaType: z.ZodString;
  dataBase64: z.ZodString;
  sizeBytes: z.ZodOptional<z.ZodNumber>;
  source: z.ZodOptional<EvalAttachmentSourceSchema>;
}>;

const evalFileAttachmentSchema: EvalFileAttachmentSchema = z.object({
  kind: z.literal("file"),
  filename: z.string().min(1),
  mediaType: z.string().min(1),
  dataBase64: z.string().min(1),
  sizeBytes: z.number().nonnegative().optional(),
  source: evalAttachmentSourceSchema.optional(),
});

export type EvalFileAttachment = z.output<typeof evalFileAttachmentSchema>;

export const evalAttachmentSchema: z.ZodDiscriminatedUnion<
  [EvalTextAttachmentSchema, EvalFileAttachmentSchema],
  "kind"
> = z.discriminatedUnion("kind", [
  evalTextAttachmentSchema,
  evalFileAttachmentSchema,
]);

export type EvalAttachment = z.output<typeof evalAttachmentSchema>;

const userPermissionLevelSchema: z.ZodEnum<{
  admin: "admin";
  trusted: "trusted";
  public: "public";
}> = z.enum(["admin", "trusted", "public"]);

const evalConversationMessageActorSchema: z.ZodPreprocess<
  typeof conversationMessageActorSchema
> = z.preprocess((value) => {
  const parsed = conversationMessageMetadataSchema.safeParse({ actor: value });
  return parsed.success ? parsed.data.actor : value;
}, conversationMessageActorSchema);

export type ConversationMessageSource = z.output<
  typeof conversationMessageSourceSchema
>;

type TurnContextSchema = z.ZodObject<{
  userPermissionLevel: z.ZodOptional<typeof userPermissionLevelSchema>;
  isAnchor: z.ZodOptional<z.ZodBoolean>;
  interfaceType: z.ZodOptional<z.ZodString>;
  channelId: z.ZodOptional<z.ZodString>;
  channelName: z.ZodOptional<z.ZodString>;
  actor: z.ZodOptional<typeof evalConversationMessageActorSchema>;
  source: z.ZodOptional<typeof conversationMessageSourceSchema>;
}>;

export const turnContextSchema: TurnContextSchema = z.object({
  userPermissionLevel: userPermissionLevelSchema.optional(),
  isAnchor: z.boolean().optional(),
  interfaceType: z.string().optional(),
  channelId: z.string().optional(),
  channelName: z.string().optional(),
  actor: evalConversationMessageActorSchema.optional(),
  source: conversationMessageSourceSchema.optional(),
});

export type TurnContext = z.output<typeof turnContextSchema>;

type TurnSchema = z.ZodObject<{
  userMessage: z.ZodString;
  confirmPendingAction: z.ZodOptional<z.ZodBoolean>;
  approvalId: z.ZodOptional<z.ZodString>;
  attachments: z.ZodOptional<z.ZodArray<typeof evalAttachmentSchema>>;
  reusePreviousAttachments: z.ZodOptional<z.ZodBoolean>;
  context: z.ZodOptional<TurnContextSchema>;
  successCriteria: z.ZodOptional<SuccessCriteriaSchema>;
}>;

/**
 * Single conversation turn
 */
export const turnSchema: TurnSchema = z.object({
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

export type Turn = z.output<typeof turnSchema>;

type TestSetupSchema = z.ZodObject<{
  permissionLevel: z.ZodDefault<typeof userPermissionLevelSchema>;
  isAnchor: z.ZodOptional<z.ZodBoolean>;
  interfaceType: z.ZodOptional<z.ZodString>;
  channelId: z.ZodOptional<z.ZodString>;
  channelName: z.ZodOptional<z.ZodString>;
}>;

/**
 * Test setup configuration
 */
export const testSetupSchema: TestSetupSchema = z.object({
  permissionLevel: userPermissionLevelSchema.default("admin"),
  isAnchor: z.boolean().optional(),
  interfaceType: z.string().optional(),
  channelId: z.string().optional(),
  channelName: z.string().optional(),
});

export type TestSetup = z.output<typeof testSetupSchema>;

type EfficiencySchema = z.ZodObject<{
  maxTokens: z.ZodOptional<z.ZodNumber>;
  maxToolCalls: z.ZodOptional<z.ZodNumber>;
  maxSteps: z.ZodOptional<z.ZodNumber>;
  maxDurationMs: z.ZodOptional<z.ZodNumber>;
}>;

/**
 * Efficiency expectations
 */
export const efficiencySchema: EfficiencySchema = z.object({
  maxTokens: z.number().optional(),
  maxToolCalls: z.number().optional(),
  maxSteps: z.number().optional(),
  maxDurationMs: z.number().optional(),
});

export type Efficiency = z.output<typeof efficiencySchema>;

type PermissionMatrixSchema = z.ZodObject<{
  public: z.ZodOptional<SuccessCriteriaSchema>;
  trusted: z.ZodOptional<SuccessCriteriaSchema>;
  admin: z.ZodOptional<SuccessCriteriaSchema>;
}>;

export const permissionMatrixSchema: PermissionMatrixSchema = z.object({
  public: successCriteriaSchema.optional(),
  trusted: successCriteriaSchema.optional(),
  admin: successCriteriaSchema.optional(),
});

export type PermissionMatrix = z.output<typeof permissionMatrixSchema>;

/**
 * Base test case fields shared by all types
 */
export const baseTestCaseSchema: z.ZodObject<{
  id: z.ZodString;
  name: z.ZodString;
  description: z.ZodOptional<z.ZodString>;
  tags: z.ZodOptional<z.ZodArray<z.ZodString>>;
}> = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  tags: z.array(z.string()).optional(),
});

export type BaseTestCase = z.output<typeof baseTestCaseSchema>;

/**
 * Agent test case definition (chat-based evaluations)
 */
export const agentTestCaseSchema: ReturnType<
  typeof baseTestCaseSchema.extend<{
    type: typeof agentTestCaseTypeSchema;
    setup: z.ZodOptional<typeof testSetupSchema>;
    turns: z.ZodArray<typeof turnSchema>;
    successCriteria: typeof successCriteriaSchema;
    permissions: z.ZodOptional<typeof permissionMatrixSchema>;
    efficiency: z.ZodOptional<typeof efficiencySchema>;
  }>
> = baseTestCaseSchema.extend({
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

export type AgentTestCase = z.output<typeof agentTestCaseSchema>;

type PathValidationSchema = z.ZodObject<{
  path: z.ZodString;
  equals: z.ZodOptional<z.ZodUnknown>;
  matches: z.ZodOptional<z.ZodString>;
  exists: z.ZodOptional<z.ZodBoolean>;
}>;

/**
 * Validation check for a specific path in the output
 */
export const pathValidationSchema: PathValidationSchema = z.object({
  path: z.string(), // JSONPath-like: "[0].sources[0].type"
  equals: z.unknown().optional(),
  matches: z.string().optional(), // Regex pattern
  exists: z.boolean().optional(),
});

export type PathValidation = z.output<typeof pathValidationSchema>;

type ItemsContainSchema = z.ZodObject<{
  field: z.ZodString;
  pattern: z.ZodOptional<z.ZodString>;
  words: z.ZodOptional<z.ZodArray<z.ZodString>>;
}>;

/**
 * Content check for items in an array
 * Supports either:
 * - `pattern`: Regex pattern for complex matching
 * - `words`: Array of words (auto-applies word boundaries)
 */
export const itemsContainSchema: ItemsContainSchema = z
  .object({
    field: z.string(),
    pattern: z.string().optional(), // Regex pattern
    words: z.array(z.string()).optional(), // Words with auto word-boundaries
  })
  .refine((data) => data.pattern !== undefined || data.words !== undefined, {
    message: "Either 'pattern' or 'words' must be provided",
  });

export type ItemsContain = z.output<typeof itemsContainSchema>;

type PluginQualityCriteriaSchema = z.ZodObject<{
  minRelevanceScore: z.ZodOptional<z.ZodNumber>;
  minAccuracyScore: z.ZodOptional<z.ZodNumber>;
  minCoverageScore: z.ZodOptional<z.ZodNumber>;
  minQualityScore: z.ZodOptional<z.ZodNumber>;
  evaluationPrompt: z.ZodOptional<z.ZodString>;
}>;

/**
 * Quality criteria for plugin tests (LLM-as-judge thresholds)
 */
export const pluginQualityCriteriaSchema: PluginQualityCriteriaSchema =
  z.object({
    minRelevanceScore: z.number().min(0).max(5).optional(),
    minAccuracyScore: z.number().min(0).max(5).optional(),
    minCoverageScore: z.number().min(0).max(5).optional(),
    minQualityScore: z.number().min(0).max(5).optional(),
    // Custom evaluation prompt for context-aware and style checks
    evaluationPrompt: z.string().optional(),
  });

export type PluginQualityCriteria = z.output<
  typeof pluginQualityCriteriaSchema
>;

type ExpectedOutputSchema = z.ZodObject<{
  minItems: z.ZodOptional<z.ZodNumber>;
  maxItems: z.ZodOptional<z.ZodNumber>;
  exactItems: z.ZodOptional<z.ZodNumber>;
  itemsContain: z.ZodOptional<z.ZodArray<ItemsContainSchema>>;
  itemsNotContain: z.ZodOptional<z.ZodArray<ItemsContainSchema>>;
  validateEach: z.ZodOptional<z.ZodArray<PathValidationSchema>>;
  qualityCriteria: z.ZodOptional<PluginQualityCriteriaSchema>;
}>;

/**
 * Expected output schema for plugin test cases
 */
export const expectedOutputSchema: ExpectedOutputSchema = z.object({
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

export type ExpectedOutput = z.output<typeof expectedOutputSchema>;

/**
 * Plugin test case definition (direct plugin functionality testing)
 */
export const pluginTestCaseSchema: ReturnType<
  typeof baseTestCaseSchema.extend<{
    type: z.ZodLiteral<"plugin">;
    plugin: z.ZodString;
    handler: z.ZodString;
    input: z.ZodRecord<z.ZodString, z.ZodUnknown>;
    expectedOutput: typeof expectedOutputSchema;
  }>
> = baseTestCaseSchema.extend({
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

export type PluginTestCase = z.output<typeof pluginTestCaseSchema>;

type AgentTestCaseOf<TType extends AgentTestCaseType> = ReturnType<
  typeof agentTestCaseSchema.extend<{ type: z.ZodLiteral<TType> }>
>;

type TestCaseSchema = z.ZodDiscriminatedUnion<
  [
    AgentTestCaseOf<"tool_invocation">,
    AgentTestCaseOf<"response_quality">,
    AgentTestCaseOf<"multi_turn">,
    typeof pluginTestCaseSchema,
  ]
>;

/**
 * Combined test case schema (discriminated union)
 */
export const testCaseSchema: TestCaseSchema = z.discriminatedUnion("type", [
  agentTestCaseSchema.extend({ type: z.literal("tool_invocation") }),
  agentTestCaseSchema.extend({ type: z.literal("response_quality") }),
  agentTestCaseSchema.extend({ type: z.literal("multi_turn") }),
  pluginTestCaseSchema,
]);

export type TestCase = z.output<typeof testCaseSchema>;
