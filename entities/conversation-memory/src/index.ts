/**
 * Conversation memory.
 *
 * Three derived entity types — summary, decision, action item — and
 * everything that reads them: retrieval, the grounding it offers the agent,
 * four dashboard widgets, and the evals that measure all of it.
 *
 * Automatic conversation-to-entity projection is disabled (see the README).
 * The projector is kept and exercised by evals; nothing triggers it in
 * production.
 */

export { conversationMemory, default } from "./conversation-memory";
export { summary } from "./summary-entity";
export { actionItem, decision } from "./memory-entities";

export { SummaryExtractor } from "./lib/summary-extractor";
export {
  SummaryProjector,
  type SummaryProjectionContext,
} from "./lib/summary-projector";
export { conversationMemoryAgentContext } from "./lib/agent-context-provider";
export { ConversationMemoryRetriever } from "./lib/conversation-memory-retriever";
export { SummarySourceReader } from "./lib/summary-source-reader";
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
