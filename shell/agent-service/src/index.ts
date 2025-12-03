/**
 * Agent Service Package
 *
 * Provides AI-powered conversation capabilities with tool access.
 * Orchestrates AIService, MCPService, ConversationService, and IdentityService
 * to enable natural language interaction with the brain's tools.
 */

export { AgentService } from "./agent-service";

// Export types
export type {
  AgentConfig,
  AgentResponse,
  IAgentService,
  PendingConfirmation,
} from "./types";
