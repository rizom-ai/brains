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
export { ConversationMemoryRetriever } from "./lib/conversation-memory-retriever";
export { SummarySourceReader } from "./lib/summary-source-reader";
export { SummaryProjectionHandler } from "./handlers/summary-projection-handler";

export type {
  SummaryEntity,
  SummaryBody,
  SummaryEntry,
  SummaryMetadata,
  SummaryConfig,
  SummaryParticipant,
  SummaryTimeRange,
} from "./schemas/summary";

export {
  summarySchema,
  summaryBodySchema,
  summaryEntrySchema,
  summaryMetadataSchema,
  summaryConfigSchema,
  summaryParticipantSchema,
  summaryTimeRangeSchema,
} from "./schemas/summary";

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
