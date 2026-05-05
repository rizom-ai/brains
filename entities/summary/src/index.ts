export { SummaryPlugin, summaryPlugin } from "./summary-plugin";
export { SummaryAdapter } from "./adapters/summary-adapter";
export { SummaryExtractor } from "./lib/summary-extractor";
export { SummaryProjector } from "./lib/summary-projector";
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
  summaryExtractionResultSchema,
  extractedSummaryEntrySchema,
} from "./schemas/extraction";
export type {
  SummaryExtractionResult,
  ExtractedSummaryEntry,
} from "./schemas/extraction";
