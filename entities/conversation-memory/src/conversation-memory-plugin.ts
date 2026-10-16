import {
  EntityPlugin,
  type DataSource,
  type EntityPluginContext,
  type EntityTypeConfig,
  type Template,
} from "@brains/plugins";
import { summarySchema, type SummaryEntity } from "./schemas/summary";
import {
  summaryConfigSchema,
  type SummaryConfig,
  type SummaryConfigInput,
} from "./schemas/summary-config";
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
import { registerActionItemsWidget } from "./lib/widgets/action-items";
import { registerDecisionsWidget } from "./lib/widgets/decisions";
import { registerRecentConversationMemoryWidget } from "./lib/widgets/recent-memory-register";
import { registerSummaryCoverageWidget } from "./lib/widgets/coverage";
import { registerConversationMemoryAgentContext } from "./lib/agent-context-provider";
import { registerSummaryEvalHandlers } from "./lib/eval-handlers";
import { ActionItemInboxSource } from "./lib/action-item-inbox-source";
import { createActionItemStatusValidator } from "./lib/action-item-validator";
import {
  BOARD_WORKSPACE_ID,
  registerBoardWorkspace,
  trackHref,
} from "./lib/board-workspace";
import {
  ACTION_ITEM_ENTITY_TYPE,
  DECISION_ENTITY_TYPE,
  SUMMARY_ENTITY_TYPE,
  SUMMARY_PLUGIN_ID,
} from "./lib/constants";
import packageJson from "../package.json";

const summaryAdapter: SummaryAdapter = new SummaryAdapter();
const decisionAdapter: DecisionAdapter = new DecisionAdapter();
const actionItemAdapter: ActionItemAdapter = new ActionItemAdapter();

export class ConversationMemoryPlugin extends EntityPlugin<
  SummaryEntity,
  SummaryConfig,
  SummaryConfigInput
> {
  /** Set once Studio has the Board; the track follow-up links to it. */
  private boardUrl: string | undefined;

  readonly entityType: typeof SUMMARY_ENTITY_TYPE = SUMMARY_ENTITY_TYPE;
  readonly schema: typeof summarySchema = summarySchema;
  readonly adapter: typeof summaryAdapter = summaryAdapter;

  declare protected config: SummaryConfig;

  constructor(config: SummaryConfigInput = {}) {
    super(SUMMARY_PLUGIN_ID, packageJson, config, summaryConfigSchema, {
      [SUMMARY_ENTITY_TYPE]: {
        create: "never",
        update: "never",
        delete: "never",
        extract: "never",
        publish: "never",
      },
    });
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

  protected override getEntityTypeConfig(): EntityTypeConfig {
    return { projectionSource: false, projectionSourceRole: "excluded" };
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
    context.entities.registerPersistValidator(
      ACTION_ITEM_ENTITY_TYPE,
      createActionItemStatusValidator(context.entityService),
    );
    if (!context.executionOnly) {
      const inboxSource = new ActionItemInboxSource(context);
      context.inbox.registerSource(inboxSource);
      context.inboxFollowUps.registerKind({
        kind: "track-as-action-item",
        label: "Track as action item",
        priority: 15,
        mode: "universal",
        permissionLevel: "trusted",
        applies: ({ sourceId, item }) =>
          this.boardUrl !== undefined &&
          item.entityRef !== undefined &&
          sourceId !== inboxSource.sourceId,
        resolve: ({ sourceId, item }) => {
          const href = this.boardUrl
            ? trackHref(this.boardUrl, sourceId, item)
            : undefined;
          return href ? { href } : undefined;
        },
      });
    }

    registerActionItemsWidget({ context });
    registerDecisionsWidget({ context });
    registerRecentConversationMemoryWidget({ context });
    registerSummaryCoverageWidget({
      context,
      config: this.config,
    });

    registerConversationMemoryAgentContext(context);

    registerSummaryEvalHandlers({
      context,
      logger: this.logger,
      config: this.config,
    });
  }

  // Studio runs in the web process, which alone has a ready phase.
  protected override async onReady(
    context: EntityPluginContext,
  ): Promise<void> {
    this.boardUrl = await registerBoardWorkspace(context, {
      visibility: this.config.memoryVisibility,
    });
  }

  protected override async onShutdown(): Promise<void> {
    if (this.boardUrl === undefined) return;
    this.boardUrl = undefined;
    await this.getContext().studio.unregisterWorkspace(BOARD_WORKSPACE_ID);
  }
}

export function conversationMemoryPlugin(
  config: SummaryConfigInput = {},
): ConversationMemoryPlugin {
  return new ConversationMemoryPlugin(config);
}
