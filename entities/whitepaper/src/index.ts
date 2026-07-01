export { WhitepaperPlugin, whitepaperPlugin } from "./plugin";

export {
  whitepaperSchema,
  whitepaperStatusSchema,
  whitepaperSourceEntityTypeSchema,
  whitepaperSourceEntitySchema,
  whitepaperDocumentReferenceSchema,
  whitepaperAppendixTypeSchema,
  whitepaperAppendixSchema,
  whitepaperFrontmatterSchema,
  whitepaperMetadataSchema,
  whitepaperWithDataSchema,
  type Whitepaper,
  type WhitepaperStatus,
  type WhitepaperFrontmatter,
  type WhitepaperMetadata,
  type WhitepaperWithData,
} from "./schemas/whitepaper";

export {
  WhitepaperAdapter,
  whitepaperAdapter,
} from "./adapters/whitepaper-adapter";

export {
  WhitepaperGenerationJobHandler,
  whitepaperGenerationJobSchema,
  whitepaperGenerationResultSchema,
  type WhitepaperGenerationJobData,
  type WhitepaperGenerationResult,
} from "./handlers/whitepaperGenerationJobHandler";

export {
  whitepaperGenerationSchema,
  whitepaperDraftExpansionSchema,
  whitepaperGenerationTemplate,
  type WhitepaperGeneration,
  type WhitepaperDraftExpansion,
} from "./templates/generation-template";

export { whitepaperDraftExpansionTemplate } from "./templates/draft-expansion-template";
