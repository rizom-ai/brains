import type { UserPermissionLevel } from "@brains/permission-service";

/**
 * Configuration for the AgentService
 */
export interface AgentConfig {
  maxSteps?: number; // Max tool call iterations, default 10
}

/**
 * Context for a chat message
 * Contains per-message information like user permission level
 */
export interface ChatContext {
  userPermissionLevel?: UserPermissionLevel; // Defaults to "public" for safety
  interfaceType?: string; // e.g., "matrix", "cli", "mcp"
  channelId?: string; // Channel/room identifier for conversation tracking
  channelName?: string; // Human-readable name for the channel/room
}

/**
 * Pending confirmation for destructive operations
 */
export interface PendingConfirmation {
  toolName: string;
  description: string;
  args: unknown;
}

/**
 * Tool result data for structured responses
 * Interfaces render these directly to ensure data is shown to users
 */
export interface ToolResultData {
  toolName: string;
  formatted: string; // Pre-formatted markdown from tool response
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

  // Confirmation flow for destructive operations
  pendingConfirmation?: PendingConfirmation;

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
   * Confirm a pending destructive operation
   * @param conversationId - ID of the conversation
   * @param confirmed - Whether the user confirmed the operation
   */
  confirmPendingAction(
    conversationId: string,
    confirmed: boolean,
  ): Promise<AgentResponse>;
}
