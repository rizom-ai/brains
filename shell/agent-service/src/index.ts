/**
 * Agent Service Package
 *
 * Provides AI-powered conversation capabilities with tool access.
 * Orchestrates MCPService, ConversationService, and IdentityService
 * to enable natural language interaction with the brain's tools.
 */

export { AgentService } from "./agent-service";
export { createBrainAgentFactory } from "./brain-agent";

// Export types
export type {
  AgentConfig,
  AgentResponse,
  BrainAgent,
  BrainAgentFactory,
  ChatContext,
  IAgentService,
  PendingConfirmation,
  ToolResultData,
} from "./types";

export type {
  BrainAgentConfig,
  BrainAgentFactoryOptions,
  BrainCallOptions,
} from "./brain-agent";
