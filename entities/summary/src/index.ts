export { SummaryPlugin, summaryPlugin } from "./summary-plugin";
export { SummaryAdapter } from "./adapters/summary-adapter";
export { SummaryExtractor } from "./lib/summary-extractor";
export { DigestHandler } from "./handlers/digest-handler";

export type {
  SummaryEntity,
  SummaryBody,
  SummaryLogEntry,
  SummaryConfig,
} from "./schemas/summary";

export type { DigestDecision } from "./lib/summary-extractor";

export {
  summarySchema,
  summaryBodySchema,
  summaryLogEntrySchema,
  summaryConfigSchema,
} from "./schemas/summary";
