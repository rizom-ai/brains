import { getErrorMessage } from "@brains/utils";
import {
  EntityPlugin,
  conversationDigestPayloadSchema,
  type BaseEntity,
  type EntityPluginContext,
  type ConversationDigestPayload,
  type MessageWithPayload,
  type DataSource,
  type Template,
} from "@brains/plugins";
import { DigestHandler } from "./handlers/digest-handler";
import type { SummaryEntity } from "./schemas/summary";
import {
  summaryConfigSchema,
  summarySchema,
  type SummaryConfig,
} from "./schemas/summary";
import { SummaryAdapter } from "./adapters/summary-adapter";
import { summaryListTemplate } from "./templates/summary-list";
import { summaryDetailTemplate } from "./templates/summary-detail";
import { summaryAiResponseTemplate } from "./templates/summary-ai-response";
import { SummaryDataSource } from "./datasources/summary-datasource";
import packageJson from "../package.json";

const summaryAdapter = new SummaryAdapter();

/**
 * Summary EntityPlugin — auto-derives summaries from conversation digests.
 * Zero tools — use system_get { entityType: "summary", id: conversationId }.
 */
export class SummaryPlugin extends EntityPlugin<SummaryEntity, SummaryConfig> {
  readonly entityType = "summary";
  readonly schema = summarySchema;
  readonly adapter = summaryAdapter;

  private digestHandler: DigestHandler | null = null;

  constructor(config?: Partial<SummaryConfig>) {
    super("summary", packageJson, config ?? {}, summaryConfigSchema);
  }

  public getConfig(): SummaryConfig {
    return this.config;
  }

  protected override getTemplates(): Record<string, Template> {
    return {
      "summary-list": summaryListTemplate,
      "summary-detail": summaryDetailTemplate,
      "ai-response": summaryAiResponseTemplate,
    };
  }

  protected override getDataSources(): DataSource[] {
    return [new SummaryDataSource(this.logger)];
  }

  protected override async onRegister(
    context: EntityPluginContext,
  ): Promise<void> {
    // Initialize digest handler
    this.digestHandler = DigestHandler.getInstance(context, this.logger);

    // Subscribe to conversation digest events
    if (this.config.enableAutoSummary) {
      context.messaging.subscribe("conversation:digest", async (message) => {
        const payload = conversationDigestPayloadSchema.parse(message.payload);
        await this.handleDigestMessage({ ...message, payload });
        return { success: true };
      });
      this.logger.debug("Summary plugin subscribed to digest events");
    }
  }

  /**
   * Derive summary from a conversation digest payload (via event).
   * Note: source is the digest payload entity, not used directly.
   */
  public override async derive(
    _source: BaseEntity,
    _event: string,
    _context: EntityPluginContext,
  ): Promise<void> {
    // Summary derivation is conversation-driven, not entity-driven.
    // Actual work happens via conversation:digest subscription.
  }

  private async handleDigestMessage(
    message: MessageWithPayload<ConversationDigestPayload>,
  ): Promise<void> {
    if (!this.digestHandler) {
      this.logger.error("Digest handler not initialized");
      return;
    }

    try {
      await this.digestHandler.handleDigest(message.payload);
    } catch (err) {
      this.logger.error("Failed to handle digest message", {
        messageId: message.id,
        error: getErrorMessage(err),
      });
    }
  }
}

export function summaryPlugin(config?: Partial<SummaryConfig>): SummaryPlugin {
  return new SummaryPlugin(config);
}
