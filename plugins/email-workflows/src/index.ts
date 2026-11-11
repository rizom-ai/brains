import { createEmailWorkflowsPackage } from "./plugin";

export {
  createEmailWorkflowsPackage,
  type EmailWorkflowsState,
} from "./plugin";
export { mailItemEntity } from "./entity/mail-item-entity";
export { emailReplyDraftEntity } from "./reply-drafts/entity/definition";
export { emailReplyDraftAdapter } from "./reply-drafts/entity/adapter";
export type { EmailContext, EmailEntityService } from "./lib/email-context";

/** Email triage, as a brain composes it. */
const emailWorkflowsPackage: ReturnType<typeof createEmailWorkflowsPackage> =
  createEmailWorkflowsPackage();
export default emailWorkflowsPackage;
export {
  MailItemAdapter,
  mailItemAdapter,
} from "./entity/adapters/mail-item-adapter";
export {
  mailCategorySchema,
  mailPrioritySchema,
  mailSenderLabelSchema,
  mailStatusSchema,
  mailItemSourceSchema,
  mailThreadKeySchema,
  mailThreadOrdinalSchema,
  mailItemFrontmatterSchema,
  mailItemMetadataSchema,
  mailItemSchema,
  type MailCategory,
  type MailPriority,
  type MailStatus,
  type MailItemSource,
  type MailItemFrontmatter,
  type MailItemMetadata,
  type MailItemEntity,
} from "./entity/schemas/mail-item";
export {
  createMailItemProjection,
  createUnclassifiedMailItemProjection,
  withMailThreadOrdinal,
  mailItemIdForMessage,
  type MailItemProjection,
} from "./lib/mail-item-projection";
export {
  EmailTriageProcessor,
  type EmailTriageProcessorDependencies,
  type MailItemRepository,
} from "./triage-processor";
export {
  createMailClassifier,
  MailClassificationError,
  buildClassificationPrompt,
  DEFAULT_EMAIL_TRIAGE_CLASSIFICATION_PROMPT,
  EMAIL_TRIAGE_CLASSIFICATION_PROMPT_TARGET,
  type MailClassifier,
  type MailClassificationCause,
} from "./lib/classifier";
export {
  MailThreadOrdinalCoordinator,
  threadOrdinalStateSchema,
  type ThreadOrdinalState,
} from "./thread-ordinal-coordinator";
export { isDeterministicBulkMail } from "./lib/bulk-filter";
export { assertClassificationIsDerived } from "./lib/source-safety";
export {
  MailTriageOperatorService,
  assertMailTriageAdmin,
} from "./operator-service";
export { MailTriageInboxSource } from "./inbox-source";
export { createEmailTriageListTool } from "./operator-tool";
export {
  retainedMailClassificationSchema,
  discardedMailClassificationSchema,
  mailTriageDecisionSchema,
  type RetainedMailClassification,
  type DiscardedMailClassification,
  type MailTriageDecision,
} from "./schemas/triage";
export {
  mailTriageFilterSchema,
  mailTriageListItemSchema,
  mailTriageListResultSchema,
  mailTriageListToolOutputSchema,
  mailTriageStatusActionSchema,
  mailTriageStatusActionResultSchema,
  type MailTriageFilter,
  type MailTriageListItem,
  type MailTriageListResult,
  type MailTriageListToolOutput,
  type MailTriageStatusAction,
  type MailTriageStatusActionResult,
} from "./schemas/operator";
