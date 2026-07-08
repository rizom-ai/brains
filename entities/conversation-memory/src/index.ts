export {
  ConversationMemoryPlugin,
  conversationMemoryPlugin,
} from "./conversation-memory-plugin";
export { SummaryAdapter } from "./adapters/summary-adapter";
export {
  ActionItemAdapter,
  DecisionAdapter,
} from "./adapters/conversation-memory-adapters";
export { SummaryExtractor } from "./lib/summary-extractor";
export { SummaryProjector } from "./lib/summary-projector";
export {
  buildConversationMemoryAgentContext,
  registerConversationMemoryAgentContext,
} from "./lib/agent-context-provider";
export { ConversationMemoryRetriever } from "./lib/conversation-memory-retriever";
export { SummarySourceReader } from "./lib/summary-source-reader";
export { SummaryProjectionHandler } from "./handlers/summary-projection-handler";

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
  actionItemAssigneeSchema,
  actionItemMetadataSchema,
  actionItemSchema,
  decisionMetadataSchema,
  decisionSchema,
  memoryActorReferenceSchema,
} from "./schemas/conversation-memory";
export type {
  ActionItemAssignee,
  ActionItemEntity,
  ActionItemMetadata,
  ConversationMemoryEntity,
  DecisionEntity,
  DecisionMetadata,
  MemoryActorReference,
} from "./schemas/conversation-memory";

export {
  summaryExtractionResultSchema,
  extractedSummaryEntrySchema,
} from "./schemas/extraction";
export type {
  SummaryExtractionResult,
  ExtractedSummaryEntry,
} from "./schemas/extraction";
export type {
  RetrieveConversationMemoryInput,
  RetrieveConversationMemoryResult,
  RetrievedConversationMemory,
} from "./lib/conversation-memory-retriever";
