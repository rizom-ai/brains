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
  enrichedWhitepaperSchema,
  templateWhitepaperSchema,
  type Whitepaper,
  type WhitepaperStatus,
  type WhitepaperFrontmatter,
  type WhitepaperMetadata,
  type WhitepaperWithData,
  type EnrichedWhitepaper,
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

export { WhitepaperDataSource } from "./datasources/whitepaper-datasource";
export { parseWhitepaperData } from "./datasources/parse-helpers";

export { getTemplates } from "./lib/register-templates";

export {
  WhitepaperListTemplate,
  type WhitepaperListProps,
} from "./templates/whitepaper-list";
export {
  WhitepaperDetailTemplate,
  type WhitepaperDetailProps,
} from "./templates/whitepaper-detail";

export {
  whitepaperGenerationSchema,
  whitepaperDraftExpansionSchema,
  whitepaperGenerationTemplate,
  type WhitepaperGeneration,
  type WhitepaperDraftExpansion,
} from "./templates/generation-template";

export { whitepaperDraftExpansionTemplate } from "./templates/draft-expansion-template";

export {
  WHITEPAPER_PRINTABLE_ATTACHMENT_TYPE,
  WHITEPAPER_PRINTABLE_TEMPLATE_NAME,
  whitepaperPrintableTemplate,
  whitepaperPrintableTemplateSchema,
  type WhitepaperPrintableTemplateData,
} from "./attachments/printable-template";

export {
  WhitepaperPrintableAttachmentProvider,
  buildPrintableContent,
  type RenderPdf,
  type WhitepaperPrintableAttachmentProviderDeps,
} from "./attachments/printable-provider";
