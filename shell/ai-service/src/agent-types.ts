import type { AgentContextItem, AgentContextRequest } from "@brains/contracts";
import type { UserPermissionLevel } from "@brains/templates";
import type {
  ConversationMessageActor,
  ConversationMessageSource,
} from "@brains/conversation-service";
import type { BrainAgentConfig, BrainCallOptions } from "./brain-agent";
import type { ICanonicalIdentityService } from "@brains/identity-service";
import type { ModelMessage } from "ai";

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
  /** Optional provider for same-turn retrieved context, e.g. durable memory. */
  agentContextProvider?: (
    request: AgentContextRequest,
  ) => Promise<AgentContextItem[]>;
  /** Optional resolver for prior uploads stored in conversation metadata. */
  uploadAttachmentResolver?: UploadAttachmentResolver;
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
  channelId?: string; // Channel/room identifier for conversation tracking
  channelName?: string; // Human-readable name for the channel/room
  actor?: ConversationMessageActor; // Stable speaker identity for the incoming message
  source?: ConversationMessageSource; // Platform-specific source provenance
  attachments?: ChatAttachment[] | undefined; // Native same-turn attachments supplied by the interface
}

/**
 * Pending confirmation for durable write operations or other approval-gated actions
 */
export interface PendingConfirmation {
  id: string;
  toolCallId?: string;
  toolName: string;
  summary: string;
  preview?: string;
  args: unknown;
}

export type ToolApprovalCardState =
  | "approval-requested"
  | "approval-responded"
  | "output-available"
  | "output-denied"
  | "output-error";

export interface ToolApprovalCard {
  kind: "tool-approval";
  id: string;
  toolCallId?: string;
  toolName: string;
  input?: Record<string, unknown>;
  summary: string;
  preview?: string;
  state: ToolApprovalCardState;
  output?: unknown;
  error?: string;
}

// Optionals mirror the zod schema in @brains/plugins (`.optional()` widens to
// `| undefined`) so the two card mirrors stay structurally interchangeable
// under exactOptionalPropertyTypes.
export interface AttachmentCardSource {
  entityType?: string | undefined;
  entityId?: string | undefined;
  attachmentType?: string | undefined;
}

export interface AttachmentCardData {
  mediaType: string;
  url: string;
  downloadUrl?: string | undefined;
  previewUrl?: string | undefined;
  filename?: string | undefined;
  sizeBytes?: number | undefined;
  source?: AttachmentCardSource | undefined;
}

export interface AttachmentCard {
  kind: "attachment";
  id: string;
  jobId?: string | undefined;
  title: string;
  description?: string | undefined;
  attachment: AttachmentCardData;
}

export interface SourceCitation {
  id: string;
  title?: string | undefined;
  source: string;
  url?: string | undefined;
  entityType?: string | undefined;
  entityId?: string | undefined;
  excerpt?: string | undefined;
  provenance?: Record<string, unknown> | undefined;
}

export interface SourcesCard {
  kind: "sources";
  id: string;
  title?: string | undefined;
  sources: SourceCitation[];
}

export interface PromptChatAction {
  type: "prompt";
  id: string;
  label: string;
  prompt: string;
  description?: string | undefined;
}

export interface EventChatAction {
  type: "event";
  id: string;
  label: string;
  event: string;
  description?: string | undefined;
}

export type ChatAction = PromptChatAction | EventChatAction;

export interface ActionsCard {
  kind: "actions";
  id: string;
  title?: string | undefined;
  defaultOpen?: boolean | undefined;
  actions: ChatAction[];
}

export type StructuredChatCard =
  | ToolApprovalCard
  | AttachmentCard
  | SourcesCard
  | ActionsCard;

/**
 * Tool result data for tracking
 * Used for logging, evals, and job tracking
 */
export interface ToolResultData {
  toolName: string;
  args?: Record<string, unknown>; // Input arguments passed to the tool
  jobId?: string; // Job ID for async tools that queue background jobs
  data?: unknown; // Tool result data (for logging/debugging)
}

/**
 * Response from the agent
 */
export interface AgentResponse {
  // Primary content (markdown)
  text: string;

  // Tool results for structured rendering
  // Interfaces should render these directly to ensure data is shown
  toolResults?: ToolResultData[];

  // Structured chat cards for interface-specific rendering of approvals,
  // tool outputs, artifacts, and future rich parts.
  cards?: StructuredChatCard[];

  // Pending confirmations for durable write operations or other approval-gated actions.
  pendingConfirmations?: PendingConfirmation[];

  // Token usage for tracking
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
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
