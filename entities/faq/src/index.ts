export { FaqPlugin, faqPlugin } from "./plugin";
export type { FaqConfig, FaqConfigInput } from "./plugin";
export { FaqAdapter, faqAdapter, faqMetadata } from "./adapters/faq-adapter";
export {
  FaqCaptureHandler,
  faqCaptureJobSchema,
  faqClassificationSchema,
  faqEntityId,
} from "./handlers/faq-capture-handler";
export type {
  FaqCaptureDeps,
  FaqCaptureJobData,
  FaqCaptureResult,
  FaqClassification,
} from "./handlers/faq-capture-handler";
export {
  faqFrontmatterSchema,
  faqMetadataSchema,
  faqSchema,
  faqStatusSchema,
} from "./schemas/faq";
export type {
  FaqEntity,
  FaqFrontmatter,
  FaqMetadata,
  FaqStatus,
} from "./schemas/faq";
export {
  FAQ_DATASOURCE_ID,
  FaqDataSource,
  faqItemSchema,
  faqSectionSchema,
} from "./datasources/faq-datasource";
export type { FaqItem, FaqSectionData } from "./datasources/faq-datasource";
export { FaqSection } from "./templates/faq-section";
