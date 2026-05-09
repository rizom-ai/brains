import {
  EntityPlugin,
  hasPersistedTargets,
  type EntityChangePayload,
  type EntityPluginContext,
  type DataSource,
  type DerivedEntityProjection,
  type Template,
} from "@brains/plugins";
import {
  CONVERSATION_MESSAGE_ADDED_CHANNEL,
  CONVERSATION_SOURCE_KIND,
} from "@brains/conversation-service";
import { z } from "@brains/utils";
import { SummaryProjectionHandler } from "./handlers/summary-projection-handler";
import {
  summaryConfigSchema,
  summarySchema,
  type SummaryConfig,
  type SummaryEntity,
} from "./schemas/summary";
import { SummaryAdapter } from "./adapters/summary-adapter";
import {
  ActionItemAdapter,
  DecisionAdapter,
} from "./adapters/conversation-memory-adapters";
import {
  actionItemSchema,
  decisionSchema,
} from "./schemas/conversation-memory";
import { summaryListTemplate } from "./templates/summary-list";
import { summaryDetailTemplate } from "./templates/summary-detail";
import { summaryAiResponseTemplate } from "./templates/summary-ai-response";
import { SummaryDataSource } from "./datasources/summary-datasource";
import { registerSummaryDashboardWidget } from "./lib/dashboard-widget";
import { registerSummaryEvalHandlers } from "./lib/eval-handlers";
import { evaluateSummaryEligibility } from "./lib/summary-space-eligibility";
import {
  ACTION_ITEM_ENTITY_TYPE,
  DECISION_ENTITY_TYPE,
  SUMMARY_ENTITY_TYPE,
  SUMMARY_JOB_SOURCE,
  SUMMARY_PLUGIN_ID,
  SUMMARY_PROJECTION_JOB_TYPE,
} from "./lib/constants";
import packageJson from "../package.json";

const summaryAdapter = new SummaryAdapter();
const decisionAdapter = new DecisionAdapter();
const actionItemAdapter = new ActionItemAdapter();

const conversationMessageAddedSchema = z.object({
  conversationId: z.string(),
});

export class ConversationMemoryPlugin extends EntityPlugin<
  SummaryEntity,
  SummaryConfig
> {
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
        id: "conversation-memory-projection",
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
            context.spaces.length > 0 &&
            !(await hasPersistedTargets(context, SUMMARY_ENTITY_TYPE)),
          jobData: { mode: "rebuild-all", reason: "initial-sync" },
          jobOptions: {
            source: SUMMARY_JOB_SOURCE,
            deduplication: "coalesce",
            deduplicationKey: "conversation-memory:rebuild-all:initial-sync",
            metadata: {
              operationType: "data_processing",
              operationTarget: "conversation-memory:rebuild-all",
              pluginId: SUMMARY_PLUGIN_ID,
            },
          },
        },
        sourceChange: {
          sourceKind: CONVERSATION_SOURCE_KIND,
          sourceTypes: [CONVERSATION_SOURCE_KIND],
          shouldEnqueue: (payload) =>
            this.shouldEnqueueConversationProjection(context, payload),
          events: [CONVERSATION_MESSAGE_ADDED_CHANNEL],
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
            delayMs: number;
            deduplication: "skip";
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
              delayMs: this.config.projectionDelayMs,
              source: SUMMARY_JOB_SOURCE,
              deduplication: "skip",
              deduplicationKey: `conversation-memory:${parsed.conversationId}`,
              metadata: {
                operationType: "data_processing" as const,
                operationTarget: `conversation-memory:${parsed.conversationId}`,
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

    const conversation = await context.conversations.get(parsed.conversationId);
    if (!conversation) return false;

    const messages = await context.conversations.getMessages(
      parsed.conversationId,
      { limit: this.config.maxSourceMessages },
    );
    const eligibility = evaluateSummaryEligibility({
      conversation,
      spaces: context.spaces,
      messages,
    });
    if (!eligibility.eligible) return false;

    return messages.length > 0;
  }

  protected override async onRegister(
    context: EntityPluginContext,
  ): Promise<void> {
    context.entities.register(
      DECISION_ENTITY_TYPE,
      decisionSchema,
      decisionAdapter,
    );
    context.entities.register(
      ACTION_ITEM_ENTITY_TYPE,
      actionItemSchema,
      actionItemAdapter,
    );

    registerSummaryDashboardWidget({
      context,
      pluginId: this.id,
      config: this.config,
    });

    registerSummaryEvalHandlers({
      context,
      logger: this.logger,
      config: this.config,
    });
  }
}

export function conversationMemoryPlugin(
  config?: Partial<SummaryConfig>,
): ConversationMemoryPlugin {
  return new ConversationMemoryPlugin(config);
}
