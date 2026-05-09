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
  SummaryTimeRange,
} from "./schemas/summary";

export {
  summarySchema,
  summaryBodySchema,
  summaryEntrySchema,
  summaryMetadataSchema,
  summaryConfigSchema,
  summaryTimeRangeSchema,
} from "./schemas/summary";

export {
  actionItemMetadataSchema,
  actionItemSchema,
  decisionMetadataSchema,
  decisionSchema,
} from "./schemas/conversation-memory";
export type {
  ActionItemEntity,
  ActionItemMetadata,
  ConversationMemoryEntity,
  DecisionEntity,
  DecisionMetadata,
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
