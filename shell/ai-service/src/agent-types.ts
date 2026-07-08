import type {
  AgentContextItem,
  AgentContextRequest,
  AgentResponse,
} from "@brains/contracts";
export type {
  ActionsCard,
  AgentResponse,
  AttachmentCard,
  AttachmentCardData,
  AttachmentCardSource,
  ChatAction,
  EventChatAction,
  PendingConfirmation,
  PromptChatAction,
  SourceCitation,
  SourcesCard,
  StructuredChatCard,
  ToolApprovalCard,
  ToolApprovalCardState,
  ToolResultData,
} from "@brains/contracts";
import type { UserPermissionLevel } from "@brains/templates";
import type {
  ConversationMessageActor,
  ConversationMessageSource,
} from "@brains/conversation-service";
import type {
  ICanonicalIdentityService,
  BrainCharacter,
  AnchorProfile,
} from "@brains/identity-service";
import type { Tool } from "@brains/mcp-service";
import type { ModelMessage } from "ai";
import { z } from "@brains/utils/zod";

/**
 * Schema for runtime call options
 * Defines type-safe inputs passed at generation time
 */
const brainCallOptionsSchemaInternal: z.ZodObject<{
  userPermissionLevel: z.ZodEnum<{
    anchor: "anchor";
    trusted: "trusted";
    public: "public";
  }>;
  conversationId: z.ZodString;
  channelId: z.ZodOptional<z.ZodString>;
  channelName: z.ZodOptional<z.ZodString>;
  interfaceType: z.ZodString;
  agentContextInstructions: z.ZodOptional<z.ZodString>;
  disableTools: z.ZodOptional<z.ZodBoolean>;
  enableCreateUpload: z.ZodOptional<z.ZodBoolean>;
  enableCreateTransform: z.ZodOptional<z.ZodBoolean>;
  hasPriorResponseCandidate: z.ZodOptional<z.ZodBoolean>;
}> = z.object({
  userPermissionLevel: z.enum(["anchor", "trusted", "public"]),
  conversationId: z.string(),
  channelId: z.string().optional(),
  channelName: z.string().optional(),
  interfaceType: z.string(),
  agentContextInstructions: z.string().optional(),
  disableTools: z.boolean().optional(),
  enableCreateUpload: z.boolean().optional(),
  enableCreateTransform: z.boolean().optional(),
  hasPriorResponseCandidate: z.boolean().optional(),
});

export const brainCallOptionsSchema: typeof brainCallOptionsSchemaInternal =
  brainCallOptionsSchemaInternal;

export type BrainCallOptions = z.infer<typeof brainCallOptionsSchema>;

/**
 * Configuration for creating a BrainAgent
 * Model and provider options are set at factory creation time
 */
export interface BrainAgentConfig {
  identity: BrainCharacter;
  profile?: AnchorProfile;
  tools: Tool[];
  pluginInstructions?: string[];
  agentInstructions?: string[];
  stepLimit?: number;
  getToolsForPermission: (level: UserPermissionLevel) => Tool[];
}

/**
 * Result shape from BrainAgent.generate()
 * Matches the subset of GenerateTextResult that AgentService uses.
 */
export interface BrainAgentResult {
  text: string;
  steps: Array<{
    toolCalls: Array<{
      toolCallId: string;
      toolName: string;
      input: unknown;
    }>;
    toolResults: Array<{
      toolCallId: string;
      toolName: string;
      output: unknown;
    }>;
  }>;
  usage: {
    inputTokens: number | undefined;
    outputTokens: number | undefined;
    totalTokens: number | undefined;
  };
}

/**
 * Interface for the brain agent.
 * ToolLoopAgent satisfies this structurally — this decouples consumers from the concrete SDK type.
 */
export interface BrainAgent {
  generate(params: {
    messages: ModelMessage[];
    options: BrainCallOptions;
  }): Promise<BrainAgentResult>;
}

/**
 * Factory function type for creating brain agents
 */
export type BrainAgentFactory = (config: BrainAgentConfig) => BrainAgent;

/**
 * Configuration for the AgentService
 */
export type CanonicalIdentityResolver = Pick<
  ICanonicalIdentityService,
  "enrichActor"
>;

export interface AgentIndexReadiness {
  isIndexReady(): boolean;
}

export type UploadAttachmentResolver = (
  source: ChatAttachmentSource,
) => Promise<ChatAttachment | null | undefined>;

export interface AgentConfig {
  /** Maximum iterations before stopping (SDK defaults to 1) */
  stepLimit?: number;
  /** Factory for creating agents (injected for testability) */
  agentFactory: BrainAgentFactory;
  /** Brain-specific behavior instructions from the brain definition */
  agentInstructions?: string[];
  /** Stable actor id used for assistant messages, e.g. brain:relay */
  assistantActorId?: string;
  /** Optional explicit actor -> canonical identity resolver */
  canonicalIdentityResolver?: CanonicalIdentityResolver;
  /** Optional semantic-index readiness gate for retrieval-backed chat. */
  indexReadiness?: AgentIndexReadiness;
  /** Optional provider for same-turn retrieved context, e.g. durable memory. */
  agentContextProvider?: (
    request: AgentContextRequest,
  ) => Promise<AgentContextItem[]>;
  /** Optional resolver for prior uploads stored in conversation metadata. */
  uploadAttachmentResolver?: UploadAttachmentResolver;
  /** Idle TTL before stopping and removing an unused conversation actor. */
  conversationActorIdleTtlMs?: number;
}

/**
 * Context for a chat message
 * Contains per-message information like user permission level
 */
export interface ChatAttachmentSource {
  kind: string;
  id: string;
}

export interface TextChatAttachment {
  kind: "text";
  filename: string;
  mediaType: string;
  content: string;
  sizeBytes?: number | undefined;
  source?: ChatAttachmentSource | undefined;
}

export interface FileChatAttachment {
  kind: "file";
  filename: string;
  mediaType: string;
  data: Uint8Array;
  sizeBytes?: number | undefined;
  source?: ChatAttachmentSource | undefined;
}

export type ChatAttachment = TextChatAttachment | FileChatAttachment;

export interface ChatContext {
  userPermissionLevel?: UserPermissionLevel; // Defaults to "public" for safety
  interfaceType?: string; // e.g., "matrix", "cli", "mcp"
  channelId?: string; // Transport channel/room identifier when distinct from conversationId
  channelName?: string; // Human-readable name for the transport channel/room
  actor?: ConversationMessageActor; // Stable speaker identity for the incoming message
  source?: ConversationMessageSource; // Platform-specific source provenance
  attachments?: ChatAttachment[] | undefined; // Native same-turn attachments supplied by the interface
}

/**
 * Agent service interface
 */
export interface IAgentService {
  /**
   * Send a message to the agent and get a response
   * @param message - The user's message
   * @param conversationId - ID of the conversation for history tracking
   * @param context - Optional context including user permission level
   */
  chat(
    message: string,
    conversationId: string,
    context?: ChatContext,
  ): Promise<AgentResponse>;

  /**
   * Confirm a pending approval-gated action
   * @param conversationId - ID of the conversation
   * @param confirmed - Whether the user confirmed the operation
   * @param approvalId - Explicit approval/action id to resolve
   */
  confirmPendingAction(
    conversationId: string,
    confirmed: boolean,
    approvalId: string,
    context: ChatContext,
  ): Promise<AgentResponse>;

  /**
   * Invalidate the cached agent so the next conversation rebuilds
   * with fresh identity, profile, and instructions.
   */
  invalidateAgent(): void;
}
