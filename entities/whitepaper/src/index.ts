export { WhitepaperPlugin, whitepaperPlugin } from "./plugin";

export {
  whitepaperSchema,
  whitepaperStatusSchema,
  whitepaperSourceEntityTypeSchema,
  whitepaperSourceEntitySchema,
  whitepaperDocumentReferenceSchema,
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
  whitepaperGenerationTemplate,
  type WhitepaperGeneration,
} from "./templates/generation-template";
