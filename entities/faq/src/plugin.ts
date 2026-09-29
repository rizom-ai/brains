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
import { z } from "@brains/utils/zod";
import { faqAdapter, type FaqAdapter } from "./adapters/faq-adapter";
import {
  FaqCaptureHandler,
  type FaqCaptureJobData,
} from "./handlers/faq-capture-handler";
import { FaqDataSource } from "./datasources/faq-datasource";
import { faqSchema, type FaqEntity } from "./schemas/faq";
import { getTemplates } from "./templates/faq-section";
import packageJson from "../package.json";

const faqConfigSchema: z.ZodObject<{
  enabled: z.ZodDefault<z.ZodBoolean>;
}> = z.object({
  /** Capture Q&A from chats. Off: no subscription, no jobs, no AI calls. */
  enabled: z.boolean().default(true),
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
        conversations: context.conversations,
        ai: context.ai,
      }),
    );

    if (!this.config.enabled) return;

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
