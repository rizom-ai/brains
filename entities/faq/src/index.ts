export { FaqPlugin, faqPlugin } from "./plugin";
export type { FaqConfig, FaqConfigInput } from "./plugin";
export { FaqAdapter, faqAdapter, faqMetadata } from "./adapters/faq-adapter";
export {
  FaqCaptureHandler,
  classifyExchange,
  faqCaptureJobSchema,
  faqClassificationSchema,
  faqSlug,
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
  faqAlternativeSchema,
} from "./schemas/faq";
export type {
  FaqAlternative,
  FaqEntity,
  FaqFrontmatter,
  FaqFrontmatterInput,
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
export {
  FaqReconcileHandler,
  faqReconcileJobSchema,
} from "./handlers/faq-reconcile-handler";
export type {
  FaqReconcileDeps,
  FaqReconcileJobData,
  FaqReconcileResult,
} from "./handlers/faq-reconcile-handler";
export {
  SAME_QUESTION_CHECK,
  SAME_QUESTION_DISTANCE,
  findSameFaq,
  isSameQuestion,
  mergeIntoFaq,
} from "./lib/faq-store";
export type { FaqStoreDeps } from "./lib/faq-store";
export { registerFaqReviewWorkspace } from "./lib/faq-review-workspace";
export { capturedReplyStore } from "./lib/captured-replies";
export type { CapturedReply, CapturedReplyStore } from "./lib/captured-replies";
