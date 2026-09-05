import { EMAIL_INBOUND, inboundEmailSchema } from "@brains/contracts";
import type { IRuntimeStateStore } from "@brains/sdk/entities";
import {
  defineServicePlugin,
  defineSubscription,
  z,
  type LoggerContract,
  type ServicePackageDefinition,
} from "@brains/sdk/services";
import { mailItem, mailItemExtension } from "./entity";
import { mailTriageInbox } from "./inbox-source";
import { emailTriageListTool } from "./operator-tool";
import { emailWorkflowsConfigSchema } from "./schemas/config";
import {
  MailThreadOrdinalCoordinator,
  threadOrdinalStateSchema,
} from "./thread-ordinal-coordinator";
import { handleTriage, triageJob } from "./triage-job";

/**
 * Email workflows: inbound mail becomes restricted, derived mail items an
 * operator routes from the inbox.
 *
 * The email interface hands each message over on the bus; this package
 * queues it for triage and acknowledges, so the mailbox cursor advances once
 * the message is durably held. The triage job classifies it against an
 * operator-editable rubric and writes a mail item, or discards it. Thread
 * positions are indexed once at ready and kept current as mail arrives.
 */

interface EmailWorkflowsState {
  readonly logger: LoggerContract;
  readonly attempts: IRuntimeStateStore<number>;
  readonly threadOrdinals: MailThreadOrdinalCoordinator;
}

const emailWorkflowsPackage: ServicePackageDefinition<
  typeof emailWorkflowsConfigSchema
> = defineServicePlugin({
  id: "email-workflows",
  config: emailWorkflowsConfigSchema,
  entities: [mailItem],

  setup: ({ state, logger }): EmailWorkflowsState => ({
    logger,
    attempts: state({
      namespace: "classification-attempts",
      schema: z.number().int().min(1).max(3),
    }),
    threadOrdinals: new MailThreadOrdinalCoordinator({
      state: state({
        namespace: "thread-ordinals",
        schema: threadOrdinalStateSchema,
      }),
    }),
  }),

  entityExtensions: () => [mailItemExtension],

  jobs: ({ state }) => [
    handleTriage({
      attempts: state.attempts,
      threadOrdinals: state.threadOrdinals,
    }),
  ],

  // Acknowledged once queued: the queue is durable and retries, so the
  // interface may advance its cursor.
  subscriptions: ({ jobs }) => [
    defineSubscription({
      topic: EMAIL_INBOUND,
      payload: inboundEmailSchema,
      handle: async ({ payload }) => {
        const job = await jobs.enqueue(triageJob, payload);
        return { queued: job.id };
      },
    }),
  ],

  inbox: ({ state }) =>
    mailTriageInbox({ threadOrdinals: state.threadOrdinals }),

  tools: () => [emailTriageListTool()],

  // Thread positions are indexed on the web process only; ready never runs
  // in a worker, which is what the class used to check by hand.
  ready: ({ state, entities }) => state.threadOrdinals.initialize(entities),
});

export default emailWorkflowsPackage;

export { mailItem, mailItemExtension } from "./entity";
export {
  emailWorkflowsConfigSchema,
  type EmailWorkflowsConfig,
  type EmailWorkflowsConfigInput,
} from "./schemas/config";
export {
  mailItemAdapter,
  createMailItemContent,
  parseMailItemContent,
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
  type TriageOutcome,
} from "./triage-processor";
export { triageJob, handleTriage } from "./triage-job";
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
  type MailThreadEntityAccess,
  type ThreadOrdinalState,
} from "./thread-ordinal-coordinator";
export { isDeterministicBulkMail } from "./lib/bulk-filter";
export { assertClassificationIsDerived } from "./lib/source-safety";
export {
  MailTriageOperatorService,
  assertMailTriageAdmin,
  type MailTriageOperatorContext,
} from "./operator-service";
export { mailTriageInbox } from "./inbox-source";
export { emailTriageListTool } from "./operator-tool";
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
  mailTriageStatusActionSchema,
  mailTriageStatusActionResultSchema,
  type MailTriageFilter,
  type MailTriageListItem,
  type MailTriageListResult,
  type MailTriageStatusAction,
  type MailTriageStatusActionResult,
} from "./schemas/operator";
