import type { Tool, ServicePluginContext } from "@brains/plugins";
import { ServicePlugin } from "@brains/plugins";
import { QueueManager } from "./queue-manager";
import { createPublishingManageTool } from "./tools";
import { ProviderRegistry } from "./provider-registry";
import { RetryTracker } from "./retry-tracker";
import { PublicationQueueService } from "./publication-queue-service";
import { PublishExecutor } from "./publish-executor";
import { PublishAssetRegistry } from "./publish-assets";
import { PublishAssetPreflight } from "./publish-asset-preflight";
import type { ContentScheduler } from "./scheduler";
import type {
  ContentPipelineConfig,
  ContentPipelineConfigInput,
} from "./types/config";
import { contentPipelineConfigSchema } from "./types/config";
import { subscribeToMessages } from "./lib/message-handlers";
import { createScheduler } from "./lib/create-scheduler";
import { registerDashboardWidget } from "./lib/dashboard-widget";
import { registerStudioWorkspace } from "./lib/studio-workspace";
import packageJson from "../package.json";

/** The services the plugin builds during registration, as one unit. */
interface ContentPipelineRuntime {
  readonly queueManager: QueueManager;
  readonly publicationQueueService: PublicationQueueService;
  readonly providerRegistry: ProviderRegistry;
  readonly retryTracker: RetryTracker;
  readonly publishExecutor: PublishExecutor;
  readonly publishAssetRegistry: PublishAssetRegistry;
  readonly publishAssetPreflight: PublishAssetPreflight;
  readonly scheduler: ContentScheduler;
}

export class ContentPipelinePlugin extends ServicePlugin<
  ContentPipelineConfig,
  ContentPipelineConfigInput
> {
  private pluginContext?: ServicePluginContext;
  private runtime: ContentPipelineRuntime | null = null;
  private studioRegistered = false;

  /**
   * The services below are constructed together in onRegister. Holding them as
   * one nullable object means the compiler proves they are present at every
   * read, instead of eight `!:` declarations each disabling that check
   * independently.
   */
  private requireRuntime(): ContentPipelineRuntime {
    if (!this.runtime) {
      throw new Error(
        "Content pipeline runtime is unavailable before plugin registration",
      );
    }
    return this.runtime;
  }

  constructor(config: ContentPipelineConfigInput = {}) {
    super("content-pipeline", packageJson, config, contentPipelineConfigSchema);
  }

  protected override async onRegister(
    context: ServicePluginContext,
  ): Promise<void> {
    this.pluginContext = context;

    const queueManager = QueueManager.createFresh();
    const publicationQueueService = new PublicationQueueService(
      context,
      queueManager,
    );
    const providerRegistry = ProviderRegistry.createFresh();
    const retryTracker = RetryTracker.createFresh();
    const publishAssetRegistry = PublishAssetRegistry.createFresh();
    const publishAssetPreflight = new PublishAssetPreflight({
      context,
      registry: publishAssetRegistry,
    });
    const publishExecutor = new PublishExecutor({
      context,
      providerRegistry,
      publishAssetPreflight,
    });

    const scheduler = createScheduler({
      context,
      config: this.config,
      queueManager,
      providerRegistry,
      retryTracker,
      publishExecutor,
      logger: this.logger,
    });

    this.runtime = {
      queueManager,
      publicationQueueService,
      providerRegistry,
      retryTracker,
      publishExecutor,
      publishAssetRegistry,
      publishAssetPreflight,
      scheduler,
    };

    subscribeToMessages(context, {
      ...this.runtime,
      logger: this.logger,
    });
  }

  protected override async onReady(
    context: ServicePluginContext,
  ): Promise<void> {
    const runtime = this.requireRuntime();
    await runtime.publicationQueueService.reconcile(
      runtime.providerRegistry.getRegisteredTypes(),
    );
    const workspaceUrl = await registerStudioWorkspace(context, {
      providerRegistry: runtime.providerRegistry,
      queueManager: runtime.queueManager,
      publicationQueueService: runtime.publicationQueueService,
      retryTracker: runtime.retryTracker,
      publishExecutor: runtime.publishExecutor,
    });
    this.studioRegistered = workspaceUrl !== undefined;
    await registerDashboardWidget(context, {
      providerRegistry: runtime.providerRegistry,
      queueManager: runtime.queueManager,
      retryTracker: runtime.retryTracker,
    });
    await runtime.scheduler.start();

    this.logger.info("Content pipeline plugin started");
  }

  protected override async getTools(): Promise<Tool[]> {
    if (!this.pluginContext) {
      throw new Error("Plugin context not initialized");
    }

    const runtime = this.requireRuntime();
    return [
      createPublishingManageTool(this.pluginContext, {
        queueManager: runtime.queueManager,
        publicationQueueService: runtime.publicationQueueService,
        providerRegistry: runtime.providerRegistry,
        publishExecutor: runtime.publishExecutor,
      }),
    ];
  }

  protected override async getInstructions(): Promise<string | undefined> {
    return `## Publishing
- Use \`publishing_manage\` to manage publishing actions.
- Use \`publishing_manage\` with \`action=queue-list\`, \`action=queue-add\`, \`action=queue-remove\`, or \`action=queue-reorder\` for publish queue requests.
- Use \`publishing_manage\` with \`action=publish\` to publish an entity directly to its platform (e.g. LinkedIn, Buttondown). This tool has its own confirmation flow; call it without \`confirmed\` when the user asks to publish instead of asking for plain-text confirmation. Follow-up requests like "publish it now" should target the entity just read, generated, or updated in the conversation, including a post just changed to draft.
- Missing publish assets such as generated OG images are reconciled automatically during publishing; do not call a separate asset reconciliation tool.`;
  }

  public getQueueManager(): QueueManager {
    return this.requireRuntime().queueManager;
  }

  public getPublicationQueueService(): PublicationQueueService {
    return this.requireRuntime().publicationQueueService;
  }

  public getProviderRegistry(): ProviderRegistry {
    return this.requireRuntime().providerRegistry;
  }

  public getRetryTracker(): RetryTracker {
    return this.requireRuntime().retryTracker;
  }

  public getPublishAssetRegistry(): PublishAssetRegistry {
    return this.requireRuntime().publishAssetRegistry;
  }

  public getScheduler(): ContentScheduler {
    return this.requireRuntime().scheduler;
  }

  protected override async onShutdown(): Promise<void> {
    if (this.studioRegistered) {
      await this.pluginContext?.studio.unregisterWorkspace(
        "content-pipeline:publishing",
      );
      this.studioRegistered = false;
    }
    // Shutdown may run after a failed registration; nothing to stop then.
    await this.runtime?.scheduler.stop();
  }
}

export function contentPipelinePlugin(
  config: ContentPipelineConfigInput = {},
): ContentPipelinePlugin {
  return new ContentPipelinePlugin(config);
}
