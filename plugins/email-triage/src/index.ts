import { PluginConfigValidationError, type Plugin } from "@brains/plugins";
import { MailItemPlugin } from "./entity/plugin";
import { EmailTriagePlugin } from "./plugin";
import {
  emailTriageConfigSchema,
  type EmailTriageConfigInput,
} from "./schemas/config";

export function emailTriage(): Plugin[];
export function emailTriage(config: EmailTriageConfigInput = {}): Plugin[] {
  const parsed = emailTriageConfigSchema.safeParse(config);
  if (!parsed.success) {
    throw new PluginConfigValidationError(
      "email-triage",
      parsed.error.issues.map((issue) => ({
        path: issue.path.map(String).join("."),
        code: issue.code,
        message: issue.message,
      })),
    );
  }
  return [new MailItemPlugin(), new EmailTriagePlugin()];
}

export { MailItemPlugin } from "./entity/plugin";
export { EmailTriagePlugin } from "./plugin";
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
  buildClassificationPrompt,
  DEFAULT_EMAIL_TRIAGE_CLASSIFICATION_PROMPT,
  EMAIL_TRIAGE_CLASSIFICATION_PROMPT_TARGET,
  type MailClassifier,
} from "./lib/classifier";
export { isDeterministicBulkMail } from "./lib/bulk-filter";
export { assertClassificationIsDerived } from "./lib/source-safety";
export {
  MailTriageOperatorService,
  assertMailTriageAdmin,
} from "./operator-service";
export { MailTriageInboxSource } from "./inbox-source";
export { createEmailTriageListTool } from "./operator-tool";
export { registerEmailTriageCmsWorkspace } from "./operator-cms";
export {
  MailTriageDashboardWidget,
  registerEmailTriageDashboardWidget,
} from "./operator-dashboard-widget";
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
  mailTriageSummarySchema,
  mailTriageWorkspaceSnapshotSchema,
  mailTriageStatusActionSchema,
  mailTriageStatusActionResultSchema,
  mailTriageDashboardDataSchema,
  type MailTriageFilter,
  type MailTriageListItem,
  type MailTriageListResult,
  type MailTriageListToolOutput,
  type MailTriageSummary,
  type MailTriageWorkspaceSnapshot,
  type MailTriageStatusAction,
  type MailTriageStatusActionResult,
  type MailTriageDashboardData,
} from "./schemas/operator";
