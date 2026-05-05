import {
  EntityPlugin,
  hasPersistedTargets,
  type EntityChangePayload,
  type EntityPluginContext,
  type DataSource,
  type DerivedEntityProjection,
  type Template,
} from "@brains/plugins";
import { z } from "@brains/utils";
import { SummaryProjectionHandler } from "./handlers/summary-projection-handler";
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
import { registerSummaryEvalHandlers } from "./lib/eval-handlers";
import {
  SUMMARY_ENTITY_TYPE,
  SUMMARY_JOB_SOURCE,
  SUMMARY_PLUGIN_ID,
  SUMMARY_PROJECTION_JOB_TYPE,
} from "./lib/constants";
import packageJson from "../package.json";

const summaryAdapter = new SummaryAdapter();

const conversationMessageAddedSchema = z.object({
  conversationId: z.string(),
});

export class SummaryPlugin extends EntityPlugin<SummaryEntity, SummaryConfig> {
  readonly entityType = SUMMARY_ENTITY_TYPE;
  readonly schema = summarySchema;
  readonly adapter = summaryAdapter;

  declare protected config: SummaryConfig;

  constructor(config: Partial<SummaryConfig> = {}) {
    super(SUMMARY_PLUGIN_ID, packageJson, config, summaryConfigSchema);
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
    return [new SummaryDataSource(this.logger.child("SummaryDataSource"))];
  }

  protected override getDerivedEntityProjections(
    context: EntityPluginContext,
  ): DerivedEntityProjection[] {
    if (!this.config.enableProjection) return [];

    return [
      {
        id: "summary-conversation-projection",
        targetType: SUMMARY_ENTITY_TYPE,
        job: {
          type: SUMMARY_PROJECTION_JOB_TYPE,
          handler: new SummaryProjectionHandler(
            context,
            this.logger,
            this.config,
          ),
        },
        initialSync: {
          shouldEnqueue: async () =>
            !(await hasPersistedTargets(context, SUMMARY_ENTITY_TYPE)),
          jobData: { mode: "rebuild-all", reason: "initial-sync" },
          jobOptions: {
            source: SUMMARY_JOB_SOURCE,
            deduplication: "coalesce",
            deduplicationKey: "summary:rebuild-all:initial-sync",
            metadata: {
              operationType: "data_processing",
              operationTarget: "summary:rebuild-all",
              pluginId: SUMMARY_PLUGIN_ID,
            },
          },
        },
        sourceChange: {
          sourceKind: "conversation",
          sourceTypes: ["conversation"],
          shouldEnqueue: (payload) =>
            this.shouldEnqueueConversationProjection(context, payload),
          events: ["conversation:messageAdded"],
          jobData: (
            payload,
          ): {
            mode: "conversation";
            conversationId: string;
            reason: string;
          } => {
            const parsed = conversationMessageAddedSchema.parse(payload);
            return {
              mode: "conversation",
              conversationId: parsed.conversationId,
              reason: "message-added",
            };
          },
          jobOptions: (
            payload,
          ): {
            priority: number;
            source: string;
            deduplication: "coalesce";
            deduplicationKey: string;
            metadata: {
              operationType: "data_processing";
              operationTarget: string;
              pluginId: string;
            };
          } => {
            const parsed = conversationMessageAddedSchema.parse(payload);
            return {
              priority: 5,
              source: SUMMARY_JOB_SOURCE,
              deduplication: "coalesce",
              deduplicationKey: `summary:${parsed.conversationId}`,
              metadata: {
                operationType: "data_processing" as const,
                operationTarget: `summary:${parsed.conversationId}`,
                pluginId: SUMMARY_PLUGIN_ID,
              },
            };
          },
        },
      },
    ];
  }

  private async shouldEnqueueConversationProjection(
    context: EntityPluginContext,
    payload: EntityChangePayload,
  ): Promise<boolean> {
    const parsed = conversationMessageAddedSchema.parse(payload);

    let existing: SummaryEntity | null = null;
    try {
      existing = await context.entityService.getEntity<SummaryEntity>(
        SUMMARY_ENTITY_TYPE,
        parsed.conversationId,
      );
    } catch {
      existing = null;
    }

    const messages = await context.conversations.getMessages(
      parsed.conversationId,
      { limit: this.config.maxSourceMessages },
    );
    if (messages.length === 0) return false;

    if (!existing) {
      return messages.length >= this.config.minMessagesBetweenProjections;
    }

    const newMessageCount = messages.length - existing.metadata.messageCount;
    if (newMessageCount >= this.config.minMessagesBetweenProjections) {
      return true;
    }

    if (newMessageCount <= 0) return false;
    if (this.config.minMinutesBetweenProjections <= 0) return true;

    const elapsedMs = Date.now() - Date.parse(existing.updated);
    return elapsedMs >= this.config.minMinutesBetweenProjections * 60_000;
  }

  protected override async onRegister(
    context: EntityPluginContext,
  ): Promise<void> {
    registerSummaryEvalHandlers({
      context,
      logger: this.logger,
      config: this.config,
    });
  }
}

export function summaryPlugin(config?: Partial<SummaryConfig>): SummaryPlugin {
  return new SummaryPlugin(config);
}
