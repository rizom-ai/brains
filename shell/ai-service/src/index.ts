/**
 * AI Service Package
 *
 * Provides AI text/object generation and agent conversation orchestration
 * using Vercel AI SDK.
 */

export { AIService } from "./aiService";

// Re-export from ai SDK
export { ToolLoopAgent, stepCountIs, dynamicTool } from "ai";
export type { LanguageModel, ToolSet, ModelMessage } from "ai";

// AI service types
export type {
  AIModelConfig,
  IAIService,
  ImageProvider,
  AspectRatio,
  ImageGenerationOptions,
  ImageGenerationResult,
} from "./types";

// Agent service (merged from @brains/agent-service)
export { AgentService } from "./agent-service";
export { createBrainAgentFactory } from "./brain-agent";
export {
  createToolExecuteWrapper,
  createMessageBusEmitter,
} from "./tool-events";

export type {
  AgentConfig,
  AgentResponse,
  BrainAgent,
  BrainAgentFactory,
  BrainAgentResult,
  ChatContext,
  IAgentService,
  PendingConfirmation,
  ToolResultData,
} from "./agent-types";

export type {
  BrainAgentConfig,
  BrainAgentFactoryOptions,
  BrainCallOptions,
} from "./brain-agent";

export type {
  ToolContextInfo,
  ToolInvocationEvent,
  ToolCompletionEvent,
  ToolEventEmitter,
} from "./tool-events";
