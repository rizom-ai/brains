import type {
  DataSource,
  EntityPluginContext,
  EntityTypeConfig,
  Plugin,
  Template,
} from "@brains/plugins";
import {
  EntityPlugin,
  conversationGuestMessageAddedChannel,
  conversationMessageAddedChannel,
  embeddingReadyChannel,
} from "@brains/plugins";
import { askedBeforeContract } from "@brains/contracts";
import { z } from "@brains/utils/zod";
import { faqAdapter, type FaqAdapter } from "./adapters/faq-adapter";
import {
  FaqCaptureHandler,
  type FaqCaptureJobData,
} from "./handlers/faq-capture-handler";
import {
  FaqReconcileHandler,
  type FaqReconcileJobData,
} from "./handlers/faq-reconcile-handler";
import { FaqDataSource } from "./datasources/faq-datasource";
import { SAME_QUESTION_DISTANCE } from "./lib/faq-store";
import { answerAskedBefore } from "./lib/asked-before";
import { capturedReplyStore } from "./lib/captured-replies";
import { registerFaqEvalHandlers } from "./lib/eval-handlers";
import { FaqInboxSource } from "./lib/faq-inbox-source";
import { faqSchema, type FaqEntity } from "./schemas/faq";
import { getTemplates } from "./templates/faq-section";
import packageJson from "../package.json";

const faqConfigSchema: z.ZodObject<{
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

const faqEntityType = "faq";

export class FaqPlugin extends EntityPlugin<
  FaqEntity,
  FaqConfig,
  FaqConfigInput
> {
  readonly entityType: typeof faqEntityType = faqEntityType;
  readonly schema: typeof faqSchema = faqSchema;
  readonly adapter: FaqAdapter = faqAdapter;

  constructor(config: FaqConfigInput = {}) {
    super("faq", packageJson, config, faqConfigSchema);
  }

  protected override getEntityTypeConfig(): EntityTypeConfig | undefined {
    return {
      projectionSource: false,
      projectionSourceRole: "excluded",
      // FAQs restate the brain's own answers; as search sources they would
      // feed unreviewed answers back into new ones.
      includeInBroadSearch: false,
      // Sources moved from frontmatter to the body: read, then rewritten.
      translatedFields: ["sources"],
      publish: { publishStatuses: ["published"] },
    };
  }

  protected override getTemplates(): Record<string, Template> {
    return getTemplates();
  }

  protected override getDataSources(): DataSource[] {
    return [new FaqDataSource(this.logger.child("FaqDataSource"))];
  }

  protected override async onRegister(
    context: EntityPluginContext,
  ): Promise<void> {
    if (!context.executionOnly)
      context.inbox.registerSource(new FaqInboxSource(context));
    context.jobs.registerHandler(
      "faq-capture",
      new FaqCaptureHandler(this.logger.child("FaqCaptureHandler"), {
        entityService: context.entityService,
        replies: capturedReplyStore(context.runtimeState),
        searchWithDistances: context.entityService.searchWithDistances.bind(
          context.entityService,
        ),
        sameQuestionDistance: this.config.sameQuestionDistance,
        conversations: context.conversations,
        ai: context.ai,
      }),
    );
    context.jobs.registerHandler(
      "faq-reconcile",
      new FaqReconcileHandler(this.logger.child("FaqReconcileHandler"), {
        entityService: context.entityService,
        searchWithDistances: context.entityService.searchWithDistances.bind(
          context.entityService,
        ),
        sameQuestionDistance: this.config.sameQuestionDistance,
        ai: context.ai,
      }),
    );

    registerFaqEvalHandlers({
      context,
      sameQuestionDistance: this.config.sameQuestionDistance,
    });

    if (!this.config.enabled) return;
    // A visitor's question a published FAQ already answers is answered from
    // it before the model is asked; the web process answers the shell here.
    if (!context.executionOnly) {
      const askedBeforeDeps = {
        entityService: context.entityService,
        searchWithDistances: context.entityService.searchWithDistances.bind(
          context.entityService,
        ),
        sameQuestionDistance: this.config.sameQuestionDistance,
        ai: context.ai,
      };
      context.messaging.answer(askedBeforeContract, (request) =>
        answerAskedBefore(askedBeforeDeps, request),
      );
    }

    // A refused enqueue is retried until the queue admits it (this.retries):
    // these events are not delivered again, so a dropped job is never made.

    // A FAQ becomes findable by meaning once its embedding exists; that is
    // when a duplicate captured moments earlier can be folded away. The
    // embedding is made where the job runs, so that process queues the fold.
    context.messaging.subscribeExecution(
      embeddingReadyChannel,
      async (ready) => {
        if (ready.entityType === faqEntityType) {
          const data: FaqReconcileJobData = { entityId: ready.entityId };
          await this.retries.run(
            () => context.jobs.enqueue({ type: "faq-reconcile", data }),
            "queue a FAQ fold",
          );
        }
        return { success: true };
      },
    );

    // Only public turns are captured: an operator asking about their own
    // brain is not a question a FAQ answers. Replies without a recorded
    // permission level have no known visibility and are never captured.
    context.messaging.subscribe(
      conversationMessageAddedChannel,
      async (reply) => {
        if (
          reply.role !== "assistant" ||
          reply.metadata?.["userPermissionLevel"] !== "public"
        )
          return { success: true };

        // The reply is the newest message now, so the count is its position.
        const position = await context.conversations.countMessages(
          reply.conversationId,
        );
        const data: FaqCaptureJobData = {
          conversationId: reply.conversationId,
          messageId: reply.messageId,
          userPermissionLevel: "public",
          position,
        };
        await this.retries.run(
          () => context.jobs.enqueue({ type: "faq-capture", data }),
          "queue a FAQ capture",
        );
        return { success: true };
      },
    );

    // A site visitor's reply answered a public turn, so its FAQ is a public
    // draft the owner reviews before anything is published.
    context.messaging.subscribe(
      conversationGuestMessageAddedChannel,
      async (reply) => {
        if (reply.role !== "assistant") return { success: true };
        const data: FaqCaptureJobData = {
          conversationId: reply.conversationId,
          messageId: reply.messageId,
          userPermissionLevel: "public",
          position: reply.position,
        };
        await this.retries.run(
          () => context.jobs.enqueue({ type: "faq-capture", data }),
          "queue a FAQ capture",
        );
        return { success: true };
      },
    );
  }
}

export function faqPlugin(config: FaqConfigInput = {}): Plugin {
  return new FaqPlugin(config);
}
