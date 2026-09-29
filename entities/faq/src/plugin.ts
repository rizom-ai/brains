import type {
  DataSource,
  EntityPluginContext,
  EntityTypeConfig,
  Plugin,
  Template,
} from "@brains/plugins";
import {
  CONVERSATION_MESSAGE_ADDED_CHANNEL,
  EntityPlugin,
  UserPermissionLevelSchema,
} from "@brains/plugins";
import { ENTITY_CHANNELS } from "@brains/contracts";
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

/** The part of a message-added event a capture needs. */
const assistantReplySchema = z.object({
  conversationId: z.string(),
  messageId: z.string(),
  role: z.literal("assistant"),
  metadata: z.object({ userPermissionLevel: UserPermissionLevelSchema }),
});

/** The part of an embedding-ready event reconciliation needs. */
const embeddingReadySchema = z.object({
  entityType: z.string(),
  entityId: z.string(),
});

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
    context.jobs.registerHandler(
      "faq-capture",
      new FaqCaptureHandler(this.logger.child("FaqCaptureHandler"), {
        entityService: context.entityService,
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
      }),
    );

    if (!this.config.enabled) return;

    // A FAQ becomes findable by meaning once its embedding exists; that is
    // when a duplicate captured moments earlier can be folded away.
    context.messaging.subscribe(
      ENTITY_CHANNELS.embeddingReady,
      async (message) => {
        const ready = embeddingReadySchema.safeParse(message.payload);
        if (ready.success && ready.data.entityType === "faq") {
          const data: FaqReconcileJobData = { entityId: ready.data.entityId };
          await context.jobs.enqueue({ type: "faq-reconcile", data });
        }
        return { success: true };
      },
    );

    // Replies without a recorded permission level have no known visibility
    // and are never captured.
    context.messaging.subscribe(
      CONVERSATION_MESSAGE_ADDED_CHANNEL,
      async (message) => {
        const reply = assistantReplySchema.safeParse(message.payload);
        if (!reply.success) return { success: true };

        const data: FaqCaptureJobData = {
          conversationId: reply.data.conversationId,
          messageId: reply.data.messageId,
          userPermissionLevel: reply.data.metadata.userPermissionLevel,
        };
        await context.jobs.enqueue({ type: "faq-capture", data });
        return { success: true };
      },
    );
  }
}

export function faqPlugin(config: FaqConfigInput = {}): Plugin {
  return new FaqPlugin(config);
}
