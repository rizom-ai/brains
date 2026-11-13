/**
 * Conversation memory: the summary, decision and action-item types, the
 * service that reads them into the agent's context, shows them on the
 * Dashboard, renders summaries and picks action items up from chat spaces.
 */
export { conversationMemoryPackage, default } from "./plugin";
export { summary } from "./summary-entity";
export { actionItem, decision } from "./memory-entities";
export {
  buildConversationMemoryAgentContext,
  registerConversationMemoryAgentContext,
} from "./lib/agent-context-provider";
export { ConversationMemoryRetriever } from "./lib/conversation-memory-retriever";
export { composeSummaryBody, parseSummaryBody } from "./lib/summary-body";

export type {
  SummaryEntity,
  SummaryBody,
  SummaryEntry,
  SummaryMetadata,
  SummaryParticipant,
  SummaryTimeRange,
} from "./schemas/summary";
export type {
  SummaryConfig,
  SummaryConfigInput,
} from "./schemas/summary-config";

export {
  summarySchema,
  summaryBodySchema,
  summaryEntrySchema,
  summaryMetadataSchema,
  summaryParticipantSchema,
  summaryTimeRangeSchema,
} from "./schemas/summary";
export { summaryConfigSchema } from "./schemas/summary-config";

export {
  decisionMetadataSchema,
  decisionSchema,
} from "./schemas/conversation-memory";
export type {
  ConversationMemoryEntity,
  DecisionEntity,
  DecisionMetadata,
} from "./schemas/conversation-memory";

export type {
  RetrieveConversationMemoryInput,
  RetrieveConversationMemoryResult,
  RetrievedConversationMemory,
} from "./lib/conversation-memory-retriever";
