import type { EmbeddingUsageMeter } from "./embedding-usage-meter";
import {
  actorRefSchema,
  type AgentContextItem,
  type AgentContextRequest,
  type AgentResponse,
  type SourceCitation,
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
import type { LanguageModelUsage, ModelMessage } from "ai";
import { z } from "@brains/utils/zod";
import {
  guestExecutionPolicySchema,
  guestScreeningSchema,
  type GuestScreening,
  type GuestScreeningOutcome,
  type GuestTurnSettlement,
  type GuestExecutionPolicy,
} from "@brains/contracts/chat";

/**
 * Schema for runtime call options
 * Defines type-safe inputs passed at generation time
 */
export const brainCallOptionsSchema: z.ZodObject<{
  userPermissionLevel: z.ZodEnum<{
    admin: "admin";
    trusted: "trusted";
    public: "public";
  }>;
  isAnchor: z.ZodOptional<z.ZodBoolean>;
  conversationId: z.ZodString;
  channelId: z.ZodOptional<z.ZodString>;
  channelName: z.ZodOptional<z.ZodString>;
  interfaceType: z.ZodString;
  actor: z.ZodOptional<typeof actorRefSchema>;
  displayName: z.ZodOptional<z.ZodString>;
  agentContextInstructions: z.ZodOptional<z.ZodString>;
  disableTools: z.ZodOptional<z.ZodBoolean>;
  enableCreateUpload: z.ZodOptional<z.ZodBoolean>;
  enableCreateTransform: z.ZodOptional<z.ZodBoolean>;
  hasPriorResponseCandidate: z.ZodOptional<z.ZodBoolean>;
  guestExecution: z.ZodOptional<typeof guestExecutionPolicySchema>;
  guestScreening: z.ZodOptional<typeof guestScreeningSchema>;
}> = z.object({
  userPermissionLevel: z.enum(["admin", "trusted", "public"]),
  isAnchor: z.boolean().optional(),
  conversationId: z.string(),
  channelId: z.string().optional(),
  channelName: z.string().optional(),
  interfaceType: z.string(),
  actor: actorRefSchema.optional(),
  displayName: z.string().optional(),
  agentContextInstructions: z.string().optional(),
  disableTools: z.boolean().optional(),
  enableCreateUpload: z.boolean().optional(),
  enableCreateTransform: z.boolean().optional(),
  hasPriorResponseCandidate: z.boolean().optional(),
  guestExecution: guestExecutionPolicySchema.optional(),
  guestScreening: guestScreeningSchema.optional(),
});

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
    /** What the provider reported for this step's model call. */
    usage?: LanguageModelUsage;
  }>;
  usage: {
    inputTokens: number | undefined;
    outputTokens: number | undefined;
    totalTokens: number | undefined;
  };
  /** A guest turn's reported usage and settled cost; never set for owners. */
  guestSettlement?: GuestTurnSettlement;
  /** What screening did with a guest turn's question; never set for owners. */
  guestScreening?: GuestScreeningOutcome;
}

/**
 * Interface for the brain agent.
 * ToolLoopAgent satisfies this structurally — this decouples consumers from the concrete SDK type.
 */
export interface BrainAgent {
  generate(params: {
    messages: ModelMessage[];
    options: BrainCallOptions;
    abortSignal?: AbortSignal;
  }): Promise<BrainAgentResult>;
}

/**
 * Factory function type for creating brain agents
 */
export type BrainAgentFactory = (config: BrainAgentConfig) => BrainAgent;

/**
 * The part of the canonical identity service that fills in an actor.
 *
 * Not `@brains/identity-service`'s `CanonicalIdentityResolver`, which is the
 * lookup function that service is configured with. This is a projection of
 * `ICanonicalIdentityService` down to the one method the agent needs, so the
 * agent can be handed the service without depending on the rest of it.
 */
export type ActorEnricher = Pick<ICanonicalIdentityService, "enrichActor">;

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
  /** Stable agent id used for assistant messages, e.g. brain:relay */
  assistantAgentId?: string;
  /** Optional explicit actor -> canonical identity resolver */
  canonicalIdentityResolver?: ActorEnricher;
  /** Optional semantic-index readiness gate for retrieval-backed chat. */
  indexReadiness?: AgentIndexReadiness;
  /** Optional provider for same-turn retrieved context, e.g. durable memory. */
  agentContextProvider?: (
    request: AgentContextRequest,
  ) => Promise<AgentContextItem[]>;
  /** Optional resolver for prior uploads stored in conversation metadata. */
  uploadAttachmentResolver?: UploadAttachmentResolver;
  /**
   * Optional finder of the public pages closest to a visitor's answer, which
   * become its sources. Guest turns only; without it, or when it fails, an
   * answer's sources are what its lookups returned.
   */
  guestAnswerSources?: (request: {
    answer: string;
  }) => Promise<SourceCitation[]>;
  /**
   * Optional meter the embedding provider reports to. A guest turn is
   * measured, and the embeddings it made join its settlement.
   */
  embeddingUsage?: EmbeddingUsageMeter;
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
  /** Server-owned limits bound to the already-reserved guest execution. */
  guestExecution?: GuestExecutionPolicy;
  /** The site's scope and refusal copy a guest question is screened against. */
  guestScreening?: GuestScreening;
  userPermissionLevel?: UserPermissionLevel; // Defaults to "public" for safety
  /** Whether the authenticated caller is the brain's configured Anchor. */
  isAnchor?: boolean;
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
  /** Guest turns can run: the search index they read is ready. */
  readonly guestReady?: boolean;
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
    signal?: AbortSignal,
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
    signal?: AbortSignal,
  ): Promise<AgentResponse>;

  /** Stop active turns and release conversation actors. */
  shutdown?(): Promise<void>;

  /**
   * Invalidate the cached agent so the next conversation rebuilds
   * with fresh identity, profile, and instructions.
   */
  invalidateAgent(): void;
}
