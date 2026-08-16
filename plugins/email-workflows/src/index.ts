import { PluginConfigValidationError, type Plugin } from "@brains/plugins";
import { MailItemPlugin } from "./entity/plugin";
import { EmailWorkflowsPlugin } from "./plugin";
import {
  emailWorkflowsConfigSchema,
  type EmailWorkflowsConfigInput,
} from "./schemas/config";

export function emailWorkflows(): Plugin[];
export function emailWorkflows(
  config: EmailWorkflowsConfigInput = {},
): Plugin[] {
  const parsed = emailWorkflowsConfigSchema.safeParse(config);
  if (!parsed.success) {
    throw new PluginConfigValidationError(
      "email-workflows",
      parsed.error.issues.map((issue) => ({
        path: issue.path.map(String).join("."),
        code: issue.code,
        message: issue.message,
      })),
    );
  }
  return [new MailItemPlugin(), new EmailWorkflowsPlugin()];
}

export { MailItemPlugin } from "./entity/plugin";
export { EmailWorkflowsPlugin } from "./plugin";
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
  buildClassificationPrompt,
  DEFAULT_EMAIL_TRIAGE_CLASSIFICATION_PROMPT,
  EMAIL_TRIAGE_CLASSIFICATION_PROMPT_TARGET,
  type MailClassifier,
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
export { registerEmailTriageDashboardWidget } from "./operator-dashboard-widget";
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
  mailTriageStatusActionSchema,
  mailTriageStatusActionResultSchema,
  mailTriageDashboardDataSchema,
  type MailTriageFilter,
  type MailTriageListItem,
  type MailTriageListResult,
  type MailTriageListToolOutput,
  type MailTriageSummary,
  type MailTriageStatusAction,
  type MailTriageStatusActionResult,
  type MailTriageDashboardData,
} from "./schemas/operator";
