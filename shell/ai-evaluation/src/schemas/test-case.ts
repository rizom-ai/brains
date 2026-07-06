import { z } from "@brains/utils/zod-v4";

export type AgentTestCaseType =
  "tool_invocation" | "response_quality" | "multi_turn";

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

export type TestCaseType = AgentTestCaseType | "plugin";

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

export interface ExpectedToolCall {
  toolName: string;
  argsContain?: Record<string, unknown> | undefined;
  argsAbsent?: string[] | undefined;
  shouldBeCalled: boolean;
}

/**
 * Expected tool call definition
 */
export const expectedToolCallSchema: z.ZodType<ExpectedToolCall> = z.object({
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

export interface ExpectedAnyToolCall {
  toolNames: string[];
  argsContain?: Record<string, unknown> | undefined;
  shouldBeCalled: boolean;
}

export const expectedAnyToolCallSchema: z.ZodType<ExpectedAnyToolCall> =
  z.object({
    toolNames: z.array(z.string()).min(1),
    argsContain: z.record(z.string(), z.unknown()).optional(),
    shouldBeCalled: z.boolean().default(true),
  });

export interface ToolCountRange {
  min?: number | undefined;
  max?: number | undefined;
}

/**
 * Tool count range for efficiency checks
 */
export const toolCountRangeSchema: z.ZodType<ToolCountRange> = z.object({
  min: z.number().optional(),
  max: z.number().optional(),
});

export interface SuccessCriteria {
  expectedTools?: ExpectedToolCall[] | undefined;
  expectedAnyTool?: ExpectedAnyToolCall[] | undefined;
  toolCountRange?: ToolCountRange | undefined;
  responseContains?: string[] | undefined;
  responseContainsAny?: string[][] | undefined;
  responseNotContains?: string[] | undefined;
  minHelpfulnessScore?: number | undefined;
  minAccuracyScore?: number | undefined;
  minInstructionFollowingScore?: number | undefined;
}

/**
 * Success criteria for evaluating test results
 */
export const successCriteriaSchema: z.ZodType<SuccessCriteria> = z.object({
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

export interface EvalAttachmentSource {
  kind: string;
  id: string;
}

type EvalAttachmentSourceSchema = z.ZodObject<{
  kind: z.ZodString;
  id: z.ZodString;
}>;

const evalAttachmentSourceSchema: EvalAttachmentSourceSchema = z.object({
  kind: z.string().min(1),
  id: z.string().min(1),
});

export interface EvalTextAttachment {
  kind: "text";
  filename: string;
  mediaType: string;
  content: string;
  sizeBytes?: number | undefined;
  source?: EvalAttachmentSource | undefined;
}

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

export interface EvalFileAttachment {
  kind: "file";
  filename: string;
  mediaType: string;
  dataBase64: string;
  sizeBytes?: number | undefined;
  source?: EvalAttachmentSource | undefined;
}

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

export type EvalAttachment = EvalTextAttachment | EvalFileAttachment;

export const evalAttachmentSchema: z.ZodDiscriminatedUnion<
  [EvalTextAttachmentSchema, EvalFileAttachmentSchema],
  "kind"
> = z.discriminatedUnion("kind", [
  evalTextAttachmentSchema,
  evalFileAttachmentSchema,
]);

type UserPermissionLevel = "anchor" | "trusted" | "public";
type MessageRole = "user" | "assistant";

const userPermissionLevelSchema: z.ZodEnum<{
  anchor: "anchor";
  trusted: "trusted";
  public: "public";
}> = z.enum(["anchor", "trusted", "public"]);

const messageRoleSchema: z.ZodEnum<{
  user: "user";
  assistant: "assistant";
}> = z.enum(["user", "assistant"]);

export interface ConversationMessageActor {
  actorId: string;
  canonicalId?: string | undefined;
  interfaceType: string;
  role: MessageRole;
  displayName?: string | undefined;
  username?: string | undefined;
  isBot?: boolean | undefined;
}

const conversationMessageActorSchema: z.ZodType<ConversationMessageActor> =
  z.object({
    actorId: z.string(),
    canonicalId: z.string().optional(),
    interfaceType: z.string(),
    role: messageRoleSchema,
    displayName: z.string().optional(),
    username: z.string().optional(),
    isBot: z.boolean().optional(),
  });

export interface ConversationMessageSource {
  messageId?: string | undefined;
  channelId?: string | undefined;
  channelName?: string | undefined;
  threadId?: string | undefined;
  metadata?: Record<string, unknown> | undefined;
}

const conversationMessageSourceSchema: z.ZodType<ConversationMessageSource> =
  z.object({
    messageId: z.string().optional(),
    channelId: z.string().optional(),
    channelName: z.string().optional(),
    threadId: z.string().optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  });

export interface TurnContext {
  userPermissionLevel?: UserPermissionLevel | undefined;
  interfaceType?: string | undefined;
  channelId?: string | undefined;
  channelName?: string | undefined;
  actor?: ConversationMessageActor | undefined;
  source?: ConversationMessageSource | undefined;
}

export const turnContextSchema: z.ZodType<TurnContext> = z
  .object({
    userPermissionLevel: userPermissionLevelSchema.optional(),
    interfaceType: z.string().optional(),
    channelId: z.string().optional(),
    channelName: z.string().optional(),
    actor: conversationMessageActorSchema.optional(),
    source: conversationMessageSourceSchema.optional(),
  })
  .partial();

export interface Turn {
  userMessage: string;
  confirmPendingAction?: boolean | undefined;
  approvalId?: string | undefined;
  attachments?: EvalAttachment[] | undefined;
  reusePreviousAttachments?: boolean | undefined;
  context?: TurnContext | undefined;
  successCriteria?: SuccessCriteria | undefined;
}

/**
 * Single conversation turn
 */
export const turnSchema: z.ZodType<Turn> = z.object({
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

export interface TestSetup {
  permissionLevel: UserPermissionLevel;
  interfaceType?: string | undefined;
  channelId?: string | undefined;
  channelName?: string | undefined;
}

/**
 * Test setup configuration
 */
export const testSetupSchema: z.ZodType<TestSetup> = z.object({
  permissionLevel: userPermissionLevelSchema.default("anchor"),
  interfaceType: z.string().optional(),
  channelId: z.string().optional(),
  channelName: z.string().optional(),
});

export interface Efficiency {
  maxTokens?: number | undefined;
  maxToolCalls?: number | undefined;
  maxSteps?: number | undefined;
  maxDurationMs?: number | undefined;
}

/**
 * Efficiency expectations
 */
export const efficiencySchema: z.ZodType<Efficiency> = z.object({
  maxTokens: z.number().optional(),
  maxToolCalls: z.number().optional(),
  maxSteps: z.number().optional(),
  maxDurationMs: z.number().optional(),
});

export interface PermissionMatrix {
  public?: SuccessCriteria | undefined;
  trusted?: SuccessCriteria | undefined;
  anchor?: SuccessCriteria | undefined;
}

export const permissionMatrixSchema: z.ZodType<PermissionMatrix> = z
  .object({
    public: successCriteriaSchema.optional(),
    trusted: successCriteriaSchema.optional(),
    anchor: successCriteriaSchema.optional(),
  })
  .partial();

export interface BaseTestCase {
  id: string;
  name: string;
  description?: string | undefined;
  tags?: string[] | undefined;
}

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

export interface AgentTestCase extends BaseTestCase {
  type: AgentTestCaseType;
  setup?: TestSetup | undefined;
  turns: Turn[];
  successCriteria: SuccessCriteria;
  permissions?: PermissionMatrix | undefined;
  efficiency?: Efficiency | undefined;
}

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

export interface PathValidation {
  path: string;
  equals?: unknown;
  matches?: string | undefined;
  exists?: boolean | undefined;
}

/**
 * Validation check for a specific path in the output
 */
export const pathValidationSchema: z.ZodType<PathValidation> = z.object({
  path: z.string(), // JSONPath-like: "[0].sources[0].type"
  equals: z.unknown().optional(),
  matches: z.string().optional(), // Regex pattern
  exists: z.boolean().optional(),
});

export interface ItemsContain {
  field: string;
  pattern?: string | undefined;
  words?: string[] | undefined;
}

/**
 * Content check for items in an array
 * Supports either:
 * - `pattern`: Regex pattern for complex matching
 * - `words`: Array of words (auto-applies word boundaries)
 */
export const itemsContainSchema: z.ZodType<ItemsContain> = z
  .object({
    field: z.string(),
    pattern: z.string().optional(), // Regex pattern
    words: z.array(z.string()).optional(), // Words with auto word-boundaries
  })
  .refine((data) => data.pattern !== undefined || data.words !== undefined, {
    message: "Either 'pattern' or 'words' must be provided",
  });

export interface PluginQualityCriteria {
  minRelevanceScore?: number | undefined;
  minAccuracyScore?: number | undefined;
  minCoverageScore?: number | undefined;
  minQualityScore?: number | undefined;
  evaluationPrompt?: string | undefined;
}

/**
 * Quality criteria for plugin tests (LLM-as-judge thresholds)
 */
export const pluginQualityCriteriaSchema: z.ZodType<PluginQualityCriteria> =
  z.object({
    minRelevanceScore: z.number().min(0).max(5).optional(),
    minAccuracyScore: z.number().min(0).max(5).optional(),
    minCoverageScore: z.number().min(0).max(5).optional(),
    minQualityScore: z.number().min(0).max(5).optional(),
    // Custom evaluation prompt for context-aware and style checks
    evaluationPrompt: z.string().optional(),
  });

export interface ExpectedOutput {
  minItems?: number | undefined;
  maxItems?: number | undefined;
  exactItems?: number | undefined;
  itemsContain?: ItemsContain[] | undefined;
  itemsNotContain?: ItemsContain[] | undefined;
  validateEach?: PathValidation[] | undefined;
  qualityCriteria?: PluginQualityCriteria | undefined;
}

/**
 * Expected output schema for plugin test cases
 */
export const expectedOutputSchema: z.ZodType<ExpectedOutput> = z.object({
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

export interface PluginTestCase extends BaseTestCase {
  type: "plugin";
  plugin: string;
  handler: string;
  input: Record<string, unknown>;
  expectedOutput: ExpectedOutput;
}

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

export type TestCase = AgentTestCase | PluginTestCase;

/**
 * Combined test case schema (discriminated union)
 */
export const testCaseSchema: z.ZodType<TestCase> = z.discriminatedUnion(
  "type",
  [
    agentTestCaseSchema.extend({ type: z.literal("tool_invocation") }),
    agentTestCaseSchema.extend({ type: z.literal("response_quality") }),
    agentTestCaseSchema.extend({ type: z.literal("multi_turn") }),
    pluginTestCaseSchema,
  ],
);
