import { PluginConfigValidationError, type Plugin } from "@brains/plugins";
import { MailItemPlugin } from "./entity/plugin";
import { EmailTriagePlugin } from "./plugin";
import {
  emailTriageConfigSchema,
  type EmailTriageConfigInput,
} from "./schemas/config";

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
  return [new MailItemPlugin(), new EmailTriagePlugin(parsed.data)];
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
  type MailClassifier,
} from "./lib/classifier";
export { isDeterministicBulkMail } from "./lib/bulk-filter";
export { assertClassificationIsDerived } from "./lib/source-safety";
export {
  retainedMailClassificationSchema,
  discardedMailClassificationSchema,
  mailTriageDecisionSchema,
  type RetainedMailClassification,
  type DiscardedMailClassification,
  type MailTriageDecision,
} from "./schemas/triage";
export {
  emailTriageConfigSchema,
  type EmailTriageConfig,
  type EmailTriageConfigInput,
} from "./schemas/config";
