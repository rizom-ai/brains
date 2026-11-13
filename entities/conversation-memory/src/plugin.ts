import {
  defineServicePlugin,
  type ServicePackageDefinition,
} from "@brains/sdk/services";
import {
  SYSTEM_CHANNELS,
  serviceRuntime,
  withJobHandlers,
} from "@brains/sdk/internal/service-runtime";
import { summaryConfigSchema } from "./schemas/summary-config";
import { summary } from "./summary-entity";
import { actionItem, decision } from "./memory-entities";
import { summaryListTemplate } from "./templates/summary-list";
import { summaryDetailTemplate } from "./templates/summary-detail";
import { channelActionItemsTemplate } from "./templates/channel-action-items";
import { summaryDataSource } from "./datasources/summary-datasource";
import { registerActionItemsWidget } from "./lib/widgets/action-items";
import { registerDecisionsWidget } from "./lib/widgets/decisions";
import { registerRecentConversationMemoryWidget } from "./lib/widgets/recent-memory-register";
import { registerConversationMemoryAgentContext } from "./lib/agent-context-provider";
import { registerMemoryEvalHandlers } from "./lib/eval-handlers";
import { flattenMemoryIds } from "./lib/flat-memory-ids";
import {
  channelPickupJobHandler,
  registerChannelActionItems,
} from "./lib/channel-action-items/register";
import { memoryContextOf } from "./lib/memory-context";
import { SUMMARY_PLUGIN_ID } from "./lib/constants";

/**
 * Conversation memory: summaries, decisions and action items, read into
 * the agent's context for its turn, shown on the Dashboard and rendered by
 * the summary templates; and action items picked up from the brain's
 * configured chat spaces, announced in the space and taken back on Undo.
 * Installed under the conversation-memory class's plugin id, so its
 * templates, data source, job, evals, widgets and runtime state keep their
 * conversation-memory names.
 */
export const conversationMemoryPackage: ServicePackageDefinition<
  typeof summaryConfigSchema
> = withJobHandlers(
  defineServicePlugin({
    id: SUMMARY_PLUGIN_ID,
    config: summaryConfigSchema,
    entities: [summary, decision, actionItem],
    setup: (setupContext): Record<never, never> => {
      const runtime = serviceRuntime(setupContext);
      const context = memoryContextOf(runtime);
      for (const [name, template] of Object.entries({
        "summary-list": summaryListTemplate,
        "summary-detail": summaryDetailTemplate,
        "channel-action-items": channelActionItemsTemplate,
      })) {
        runtime.template(name, template);
      }
      runtime.dataSource(
        summaryDataSource(runtime.logger.child("SummaryDataSource")),
      );

      // Moved once the startup import has every stored file's entity in place.
      runtime.listen(SYSTEM_CHANNELS.startupContentSettled, async () => {
        const moved = await flattenMemoryIds(context.entityService);
        if (moved > 0) {
          runtime.logger.info(
            `Moved ${moved} action items and decisions to flat ids`,
          );
        }
      });

      registerChannelActionItems(runtime, context, {
        visibility: setupContext.config.memoryVisibility,
      });

      registerActionItemsWidget(runtime, context);
      registerDecisionsWidget(runtime, context);
      registerRecentConversationMemoryWidget(runtime, context);

      registerConversationMemoryAgentContext(runtime, context);

      registerMemoryEvalHandlers(runtime, context);
      return {};
    },
  }),
  (slotContext) => {
    const runtime = serviceRuntime(slotContext);
    return [
      channelPickupJobHandler(
        runtime,
        memoryContextOf(runtime),
        slotContext.config.memoryVisibility,
      ),
    ];
  },
);

export default conversationMemoryPackage;
