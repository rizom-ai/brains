import { askedBeforeContract } from "@brains/contracts";
import {
  defineServicePlugin,
  z,
  type ServicePackageDefinition,
} from "@brains/sdk/services";
import {
  conversationGuestMessageAddedChannel,
  conversationMessageAddedChannel,
  embeddingReadyChannel,
  serviceRuntime,
  withJobHandlers,
  type ServiceRuntime,
} from "@brains/sdk/internal/service-runtime";
import { faq } from "./faq-entity";
import { faqDataSource } from "./datasources/faq-datasource";
import {
  faqCaptureJob,
  type FaqCaptureDeps,
  type FaqCaptureJobData,
} from "./handlers/faq-capture-handler";
import {
  faqReconcileJob,
  type FaqReconcileJobData,
} from "./handlers/faq-reconcile-handler";
import { SAME_QUESTION_DISTANCE } from "./lib/faq-store";
import { answerAskedBefore } from "./lib/asked-before";
import { capturedReplyStore } from "./lib/captured-replies";
import { registerFaqEvalHandlers } from "./lib/eval-handlers";
import { FaqInboxSource } from "./lib/faq-inbox-source";
import { getTemplates } from "./templates/faq-section";

export const faqConfigSchema: z.ZodObject<{
  enabled: z.ZodDefault<z.ZodBoolean>;
  sameQuestionDistance: z.ZodDefault<z.ZodNumber>;
}> = z.object({
  /** Capture Q&A from chats. Off: no subscription, no jobs, no AI calls. */
  enabled: z.boolean().default(true),
  /** Largest cosine distance at which two FAQs ask the same question. */
  sameQuestionDistance: z
    .number()
    .min(0)
    .max(1)
    .default(SAME_QUESTION_DISTANCE),
});

export type FaqConfig = z.output<typeof faqConfigSchema>;
export type FaqConfigInput = z.input<typeof faqConfigSchema>;

/** The capture deps over the package's runtime, as the class built them. */
function captureDeps(
  runtime: ServiceRuntime,
  config: FaqConfig,
): FaqCaptureDeps {
  return {
    entityService: {
      getEntity: runtime.entityReads.getEntity,
      updateEntity: runtime.entityWrites.updateEntity,
      getEntityMutationReceipt:
        runtime.entityMutations.getEntityMutationReceipt,
      getEntityWriteSnapshot: runtime.entityMutations.getEntityWriteSnapshot,
      applyEntityMutationOnce: runtime.entityMutations.applyEntityMutationOnce,
    },
    replies: capturedReplyStore(runtime.classRuntimeState),
    searchWithDistances: runtime.entityReads.searchWithDistances,
    sameQuestionDistance: config.sameQuestionDistance,
    conversations: runtime.conversations,
    ai: runtime.ai,
  };
}

/** What a reply's subscriptions do, enabled, in the processes the class heard them. */
function listenForReplies(runtime: ServiceRuntime): void {
  // A refused enqueue is retried until the queue admits it (retries):
  // these events are not delivered again, so a dropped job is never made.

  // A FAQ becomes findable by meaning once its embedding exists; that is
  // when a duplicate captured moments earlier can be folded away. The
  // embedding is made where the job runs, so that process queues the fold.
  runtime.listen(
    embeddingReadyChannel,
    async ({ payload: ready }) => {
      if (ready.entityType !== faq.type) return;
      const data: FaqReconcileJobData = { entityId: ready.entityId };
      await runtime.retries.run(
        () => runtime.jobs.enqueue({ type: "faq-reconcile", data }),
        "queue a FAQ fold",
      );
    },
    { mode: "execution" },
  );
  if (runtime.executionOnly) return;

  // Only public turns are captured: an operator asking about their own
  // brain is not a question a FAQ answers. Replies without a recorded
  // permission level have no known visibility and are never captured.
  runtime.listen(
    conversationMessageAddedChannel,
    async ({ payload: reply }) => {
      if (
        reply.role !== "assistant" ||
        reply.metadata?.["userPermissionLevel"] !== "public"
      )
        return;
      // The reply is the newest message now, so the count is its position.
      const position = await runtime.conversations.countMessages(
        reply.conversationId,
      );
      const data: FaqCaptureJobData = {
        conversationId: reply.conversationId,
        messageId: reply.messageId,
        userPermissionLevel: "public",
        position,
      };
      await runtime.retries.run(
        () => runtime.jobs.enqueue({ type: "faq-capture", data }),
        "queue a FAQ capture",
      );
    },
  );

  // A site visitor's reply answered a public turn, so its FAQ is a public
  // draft the owner reviews before anything is published.
  runtime.listen(
    conversationGuestMessageAddedChannel,
    async ({ payload: reply }) => {
      if (reply.role !== "assistant") return;
      const data: FaqCaptureJobData = {
        conversationId: reply.conversationId,
        messageId: reply.messageId,
        userPermissionLevel: "public",
        position: reply.position,
      };
      await runtime.retries.run(
        () => runtime.jobs.enqueue({ type: "faq-capture", data }),
        "queue a FAQ capture",
      );
    },
  );
}

/**
 * FAQs captured from chats: a public turn's reusable question and answer
 * becomes a draft the owner publishes from the Inbox, a repeated question
 * counts against the FAQ that asks it, and a duplicate drafted moments
 * apart folds into it once both can be found by meaning. A guest's
 * question a published FAQ answers is answered from it. Installed under
 * the faq class's plugin id, so its jobs, template and data source keep
 * their faq: names.
 */
export const faqPackage: ServicePackageDefinition<typeof faqConfigSchema> =
  withJobHandlers(
    defineServicePlugin({
      id: "faqs",
      config: faqConfigSchema,
      entities: [faq],
      setup: (context): Record<never, never> => {
        const runtime = serviceRuntime(context);
        const { config } = context;
        for (const [name, template] of Object.entries(getTemplates())) {
          runtime.template(name, template);
        }
        runtime.dataSource(faqDataSource);
        if (!runtime.executionOnly)
          runtime.inboxSource(
            new FaqInboxSource({
              entityService: {
                listEntities: runtime.entityReads.listEntities,
                getEntity: runtime.entityReads.getEntity,
                updateEntity: runtime.entityWrites.updateEntity,
                deleteEntity: runtime.entityWrites.deleteEntity,
              },
              permissions: runtime.permissions,
            }),
          );
        registerFaqEvalHandlers({
          context: runtime,
          sameQuestionDistance: config.sameQuestionDistance,
        });
        if (!config.enabled) return {};
        // A visitor's question a published FAQ already answers is answered
        // from it before the model is asked; the web process answers.
        if (!runtime.executionOnly) {
          const deps = captureDeps(runtime, config);
          runtime.answer(askedBeforeContract, ({ request }) =>
            answerAskedBefore(deps, request),
          );
        }
        listenForReplies(runtime);
        return {};
      },
    }),
    (context) => {
      const runtime = serviceRuntime(context);
      const deps = captureDeps(runtime, context.config);
      return [
        faqCaptureJob(deps),
        faqReconcileJob({
          entityService: {
            getEntity: runtime.entityReads.getEntity,
            updateEntity: runtime.entityWrites.updateEntity,
            getEntityWriteSnapshot:
              runtime.entityMutations.getEntityWriteSnapshot,
            foldEntity: runtime.entityMutations.foldEntity,
          },
          searchWithDistances: runtime.entityReads.searchWithDistances,
          sameQuestionDistance: context.config.sameQuestionDistance,
          ai: runtime.ai,
        }),
      ];
    },
  );

export default faqPackage;
