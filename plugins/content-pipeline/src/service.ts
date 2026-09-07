import {
  defineServicePlugin,
  defineTool,
  type ServicePackageDefinition,
  type ToolContext,
} from "@brains/sdk/services";
import { PublicationQueueService } from "./publication-queue-service";
import { ProviderRegistry } from "./provider-registry";
import { PublishAssetPreflight } from "./publish-asset-preflight";
import { PublishAssetRegistry } from "./publish-assets";
import { PublishExecutor } from "./publish-executor";
import { QueueManager } from "./queue-manager";
import { RetryTracker } from "./retry-tracker";
import type { ContentScheduler } from "./scheduler";
import type { PipelineRuntime } from "./runtime";
import { createScheduler } from "./lib/create-scheduler";
import {
  loadPipelineWidget,
  publicationPipelineWidget,
} from "./lib/dashboard-widget";
import { pipelineSubscriptions } from "./lib/message-handlers";
import {
  publishAction,
  publishingWorkspace,
  publishingWorkspaceHandlers,
  queueAction,
  removeAction,
  reorderAction,
  retryAction,
} from "./lib/studio-workspace";
import {
  handlePublishingManage,
  publishingManageInputSchema,
  publishingManageOutputSchema,
  type PublishingManageOutput,
} from "./tools/manage";
import { contentPipelineConfigSchema } from "./types/config";

/**
 * Collaborators a test supplies in place of the ones the service builds.
 *
 * A queue, a provider registry and a retry tracker are state, not
 * configuration: a test that asserts what ended up queued needs the same
 * object the service used, and production leaves these unset.
 */
export interface ContentPipelineDeps {
  queueManager?: QueueManager;
  providerRegistry?: ProviderRegistry;
  retryTracker?: RetryTracker;
  publishAssetRegistry?: PublishAssetRegistry;
}

/** What the pipeline holds while it runs. */
export interface ContentPipelineState {
  readonly runtime: PipelineRuntime;
  readonly queueManager: QueueManager;
  readonly publicationQueueService: PublicationQueueService;
  readonly providerRegistry: ProviderRegistry;
  readonly retryTracker: RetryTracker;
  readonly publishExecutor: PublishExecutor;
  readonly publishAssetRegistry: PublishAssetRegistry;
  readonly publishAssetPreflight: PublishAssetPreflight;
  readonly scheduler: ContentScheduler;
}

/** A publish the brain asked for itself, with no person behind it. */
const SYSTEM_CALLER: ToolContext = {
  interfaceType: "system",
  actor: { kind: "service", serviceId: "content-pipeline" },
  userPermissionLevel: "admin",
};

const INSTRUCTIONS = `## Publishing
- Use \`publishing_manage\` to manage publishing actions.
- Use \`publishing_manage\` with \`action=queue-list\`, \`action=queue-add\`, \`action=queue-remove\`, or \`action=queue-reorder\` for publish queue requests.
- Use \`publishing_manage\` with \`action=publish\` to publish an entity directly to its platform (e.g. LinkedIn, Buttondown). This tool has its own confirmation flow; call it without \`confirmed\` when the user asks to publish instead of asking for plain-text confirmation. Follow-up requests like "publish it now" should target the entity just read, generated, or updated in the conversation, including a post just changed to draft.
- Missing publish assets such as generated OG images are reconciled automatically during publishing; do not call a separate asset reconciliation tool.`;

/**
 * The publish pipeline: one queue per entity type, a schedule that drains it,
 * and the record of what went out.
 *
 * It owns no entity types. Every type it publishes belongs to another
 * package, which delegated the act by declaring `publish`; recording the
 * outcome goes back through that delegation, and a type nobody delegated is
 * refused. Generation assets work the same way — the job belongs to a third
 * package and the entity's own declaration names it.
 */
export function contentPipelineService(
  deps: ContentPipelineDeps = {},
): ServicePackageDefinition<typeof contentPipelineConfigSchema> {
  return defineServicePlugin(
    {
      id: "publishing",
      config: contentPipelineConfigSchema,

      setup: ({
        config,
        lifecycle,
        entities,
        publishing,
        permissions,
        attachments,
        messaging,
        jobs,
        state,
        logger,
      }): ContentPipelineState => {
        const runtime: PipelineRuntime = {
          entities,
          publishing,
          permissions,
          attachments,
          messaging,
          jobs,
          state,
          logger,
        };
        const queueManager = deps.queueManager ?? QueueManager.createFresh();
        const providerRegistry =
          deps.providerRegistry ?? ProviderRegistry.createFresh();
        const retryTracker = deps.retryTracker ?? RetryTracker.createFresh();
        const publishAssetRegistry =
          deps.publishAssetRegistry ?? PublishAssetRegistry.createFresh();
        const publicationQueueService = new PublicationQueueService(
          runtime,
          queueManager,
        );
        const publishAssetPreflight = new PublishAssetPreflight({
          runtime,
          registry: publishAssetRegistry,
        });
        const publishExecutor = new PublishExecutor({
          runtime,
          providerRegistry,
          publishAssetPreflight,
        });
        const scheduler = createScheduler({
          context: runtime,
          config,
          queueManager,
          providerRegistry,
          retryTracker,
          publishExecutor,
          logger,
        });
        lifecycle.onCleanup(() => scheduler.stop());
        return {
          runtime,
          queueManager,
          publicationQueueService,
          providerRegistry,
          retryTracker,
          publishExecutor,
          publishAssetRegistry,
          publishAssetPreflight,
          scheduler,
        };
      },
    },
    {
      subscriptions: ({ state }) =>
        pipelineSubscriptions(state.runtime, {
          queueManager: state.queueManager,
          publicationQueueService: state.publicationQueueService,
          providerRegistry: state.providerRegistry,
          retryTracker: state.retryTracker,
          publishExecutor: state.publishExecutor,
          publishAssetRegistry: state.publishAssetRegistry,
          publishAssetPreflight: state.publishAssetPreflight,
          scheduler: state.scheduler,
          logger: state.runtime.logger,
        }),

      tools: ({ state }) => [
        defineTool({
          name: "manage",
          description:
            "Manage publishing: inspect and change the publish queue, or publish an entity to its platform.",
          input: publishingManageInputSchema,
          output: publishingManageOutputSchema,
          permission: "trusted",
          sideEffects: "external",
          execute: async ({ input, caller }): Promise<PublishingManageOutput> =>
            publishingManageOutputSchema.parse(
              await handlePublishingManage({
                runtime: state.runtime,
                services: {
                  queueManager: state.queueManager,
                  publicationQueueService: state.publicationQueueService,
                  providerRegistry: state.providerRegistry,
                  publishExecutor: state.publishExecutor,
                },
                input,
                caller: caller ?? SYSTEM_CALLER,
              }),
            ),
        }),
      ],

      dashboardWidgets: (context) => [
        publicationPipelineWidget.bind(
          context,
          loadPipelineWidget(context.state.runtime, {
            providerRegistry: context.state.providerRegistry,
            queueManager: context.state.queueManager,
            retryTracker: context.state.retryTracker,
          }),
        ),
      ],

      studioWorkspaces: (context) => {
        const handlers = publishingWorkspaceHandlers(context.state.runtime, {
          providerRegistry: context.state.providerRegistry,
          queueManager: context.state.queueManager,
          publicationQueueService: context.state.publicationQueueService,
          retryTracker: context.state.retryTracker,
          publishExecutor: context.state.publishExecutor,
        });
        return [
          publishingWorkspace.bind(context, {
            authorize: handlers.authorize,
            listEntityTypes: handlers.listEntityTypes,
            load: handlers.load,
            actions: [
              queueAction.bind(context, handlers.queue),
              removeAction.bind(context, handlers.remove),
              retryAction.bind(context, handlers.retry),
              reorderAction.bind(context, handlers.reorder),
              publishAction.bind(
                context,
                handlers.publish,
                handlers.preparePublish,
              ),
            ],
          }),
        ];
      },

      // The queue is durable intent recorded on entities; the in-memory
      // projection is rebuilt from them, and only then does the schedule start.
      ready: async ({ state }) => {
        await state.publicationQueueService.reconcile(
          state.providerRegistry.getRegisteredTypes(),
        );
        await state.scheduler.start();
        state.runtime.logger.info("Content pipeline started");
      },

      instructions: () => INSTRUCTIONS,
    },
  );
}
