import { faqPackage } from "./plugin";

export {
  faqPackage,
  faqConfigSchema,
  type FaqConfig,
  type FaqConfigInput,
} from "./plugin";
export { faq } from "./faq-entity";
export {
  currentFaqBody,
  faqBody,
  faqBodyCodec,
  faqDocument,
  faqMetadata,
  faqRecord,
  readFaq,
  type FaqParts,
} from "./lib/faq-body";
export {
  captureReply,
  classifyExchange,
  faqCaptureJob,
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
  faqDataSource,
  faqItemSchema,
  faqSectionSchema,
  fetchFaqSection,
  loadPublicFaqs,
} from "./datasources/faq-datasource";
export type { FaqItem, FaqSectionData } from "./datasources/faq-datasource";
export { FaqSection } from "./templates/faq-section";
export {
  faqReconcileJob,
  faqReconcileJobSchema,
  reconcileFaq,
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
  prepareFaqMerge,
} from "./lib/faq-store";
export type { FaqStoreDeps } from "./lib/faq-store";
export { FaqInboxSource } from "./lib/faq-inbox-source";
export { capturedReplyStore } from "./lib/captured-replies";
export type { CapturedReply, CapturedReplyStore } from "./lib/captured-replies";
export { answerAskedBefore } from "./lib/asked-before";

export default faqPackage;
