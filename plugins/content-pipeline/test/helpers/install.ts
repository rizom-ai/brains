import {
  bindPluginPackageMetadata,
  createServicePluginContext,
  PublishDelegationRegistry,
  instantiatePluginPackageDefinition,
  type Plugin,
  type PluginCapabilities,
  type ServicePublishingAccess,
} from "@brains/plugins";
import {
  createMockServicePluginContext,
  type MockServicePluginContext,
  type MockShell,
  type PluginTestHarness,
} from "@brains/plugins/test";
import { mock, type Mock } from "bun:test";
import {
  contentPipelineService,
  ProviderRegistry,
  PublicationQueueService,
  PublishAssetRegistry,
  QueueManager,
  RetryTracker,
  type ContentPipelineConfigInput,
  type ContentPipelineDeps,
  type PipelineRuntime,
} from "../../src";
import packageJson from "../../package.json";

export const PACKAGE_METADATA: { name: string; version: string } = {
  name: packageJson.name,
  version: packageJson.version,
};
export const PIPELINE_PLUGIN_ID: string = `${packageJson.name}:publishing`;
export const MANAGE_TOOL = "publishing_manage";

/** A queued job's payload, as the queue stored it. */
function parseJobData(data: string): unknown {
  try {
    return JSON.parse(data);
  } catch {
    return undefined;
  }
}

/** How the runtime prefixes this package's runtime-state scopes. */
const STATE_PREFIX = packageJson.name.replace(/^@/u, "").replaceAll("/", ".");

/** The types these tests publish, standing in for the packages that own them. */
/** The generation job those packages named for their publish assets. */
const DEFAULT_ASSET_JOB_TYPES: Readonly<Record<string, string>> = {
  "og-image": "image:image-render-source",
};

const DEFAULT_DELEGATED = [
  "social-post",
  "blog-post",
  "post",
  "newsletter",
  "workflow-card",
];

/**
 * Publish state, as a package that declared `publish` delegates it.
 *
 * The runtime records a real delegation when an entity declaration
 * registers; a unit test that never installs one says here which types it is
 * standing in for, and writes go to the shell's entity service as they would.
 */
export function publishingFor(
  shell: MockShell,
  options: {
    delegated?: readonly string[];
    assetJobTypes?: Readonly<Record<string, string>>;
  } = {},
): ServicePublishingAccess {
  const delegated = new Set(options.delegated ?? DEFAULT_DELEGATED);
  const assetJobTypes = options.assetJobTypes ?? DEFAULT_ASSET_JOB_TYPES;
  return {
    delegated: (entityType) => delegated.has(entityType),
    assetJob: (_entityType, attachmentType) => assetJobTypes[attachmentType],
    update: async (entity): Promise<{ entityId: string; jobId: string }> => {
      if (!delegated.has(entity.entityType)) {
        throw new Error(
          `"${entity.entityType}" did not delegate publishing, so the pipeline may not record a publish outcome on it`,
        );
      }
      return shell.getEntityService().updateEntity({ entity });
    },
    enqueueAsset: async ({
      attachmentType,
      data,
      deduplicationKey,
    }): Promise<string> => {
      const jobType = assetJobTypes[attachmentType];
      if (!jobType) {
        throw new Error(
          `nobody did not declare "${attachmentType}" as a generated publish asset`,
        );
      }
      return shell.getJobQueueService().enqueue({
        type: jobType,
        data,
        options: {
          source: PIPELINE_PLUGIN_ID,
          metadata: { operationType: "content_operations" },
          deduplication: "skip",
          deduplicationKey,
        },
      });
    },
  };
}

/** The runtime the pipeline holds, over a mock shell. */
export function runtimeFor(
  shell: MockShell,
  options: {
    delegated?: readonly string[];
    assetJobTypes?: Readonly<Record<string, string>>;
  } = {},
): PipelineRuntime {
  const context = createServicePluginContext(shell, "publishing");
  return {
    entities: context.entityService,
    publishing: publishingFor(shell, options),
    permissions: context.permissions,
    attachments: context.attachments,
    messaging: {
      send: (message) =>
        context.messaging.send({
          type: message.type,
          payload: message.payload,
        }),
      publish: async ({ topic, data }): Promise<void> => {
        await context.messaging.send({
          type: topic,
          payload: data,
          broadcast: true,
        });
      },
    },
    jobs: {
      recent: async () => [],
      find: async () => null,
      active: async () =>
        (await context.jobs.getActiveJobs())
          .filter(
            (job) =>
              job.source === PIPELINE_PLUGIN_ID &&
              (job.status === "pending" || job.status === "processing"),
          )
          .map((job) => ({
            id: job.id,
            type: job.type,
            status: job.status === "processing" ? "processing" : "pending",
            data: parseJobData(job.data),
          })),
      enqueue: (): never => {
        throw new Error("This test does not declare jobs");
      },
      status: async (): Promise<null> => null,
    },
    // The runtime files a scope under the declaring package, so a reader
    // built here has to look in the same place.
    state: (scope) =>
      context.runtimeState.scoped({
        ...scope,
        namespace: `${STATE_PREFIX}.${scope.namespace}`,
      }),
    logger: context.logger,
  };
}

export interface InstalledPipeline {
  readonly plugin: Plugin;
  readonly capabilities: PluginCapabilities;
  readonly queueManager: QueueManager;
  readonly providerRegistry: ProviderRegistry;
  readonly retryTracker: RetryTracker;
  readonly publishAssetRegistry: PublishAssetRegistry;
}

/**
 * The pipeline as the runtime builds it, over collaborators the test holds.
 *
 * The registries are passed in rather than read back out: a test asserting
 * what ended up queued needs the same object the service used.
 */
export async function installPipeline(
  harness: PluginTestHarness<Plugin>,
  config: ContentPipelineConfigInput = {},
  deps: ContentPipelineDeps & { delegated?: readonly string[] } = {},
): Promise<InstalledPipeline> {
  // A type reaches the pipeline because its own package declared `publish`;
  // these tests stand in for those packages.
  const registry = PublishDelegationRegistry.getInstance();
  for (const entityType of deps.delegated ?? DEFAULT_DELEGATED) {
    registry.register({
      entityType,
      update: (entity) =>
        harness.getMockShell().getEntityService().updateEntity({ entity }),
    });
    registry.registerAssets(
      entityType,
      new Map(Object.entries(DEFAULT_ASSET_JOB_TYPES)),
    );
  }
  const queueManager = deps.queueManager ?? QueueManager.createFresh();
  const providerRegistry =
    deps.providerRegistry ?? ProviderRegistry.createFresh();
  const retryTracker = deps.retryTracker ?? RetryTracker.createFresh();
  const publishAssetRegistry =
    deps.publishAssetRegistry ?? PublishAssetRegistry.createFresh();
  const definition = contentPipelineService({
    queueManager,
    providerRegistry,
    retryTracker,
    publishAssetRegistry,
  });
  bindPluginPackageMetadata(definition, PACKAGE_METADATA);
  const [plugin] = instantiatePluginPackageDefinition(
    definition,
    config,
    PACKAGE_METADATA,
  );
  if (!plugin) throw new Error("Content pipeline plugin was not created");
  const capabilities = await harness.installPlugin(plugin);
  return {
    plugin,
    capabilities,
    queueManager,
    providerRegistry,
    retryTracker,
    publishAssetRegistry,
  };
}

/**
 * The durable side of the queue, read back through a second reader.
 *
 * The records live in runtime state under a fixed namespace, so a reader
 * built over the same shell sees exactly what the installed service wrote.
 */
export function storedQueueFor(
  harness: PluginTestHarness<Plugin>,
  queueManager: QueueManager,
): PublicationQueueService {
  return new PublicationQueueService(
    runtimeFor(harness.getMockShell()),
    queueManager,
  );
}

/**
 * A runtime whose namespaces are spied, for a unit test that asserts what the
 * pipeline asked of the brain rather than what the brain did.
 */
export function mockRuntimeFor(
  options: Parameters<typeof createMockServicePluginContext>[0] & {
    assetJobTypes?: Readonly<Record<string, string>>;
  } = {},
): {
  runtime: PipelineRuntime;
  enqueueAsset: Mock<ServicePublishingAccess["enqueueAsset"]>;
  update: Mock<ServicePublishingAccess["update"]>;
  context: MockServicePluginContext;
} {
  const { assetJobTypes = {}, ...contextOptions } = options;
  const context = createMockServicePluginContext(contextOptions);
  const enqueueAsset = mock<ServicePublishingAccess["enqueueAsset"]>(
    async ({ attachmentType }) => {
      const jobType = assetJobTypes[attachmentType];
      if (!jobType) {
        throw new Error(
          `"${attachmentType}" was not declared as a generated publish asset`,
        );
      }
      return `job-for-${jobType}`;
    },
  );
  const update = mock<ServicePublishingAccess["update"]>(async (entity) => ({
    entityId: entity.id,
    jobId: "job-1",
  }));
  return {
    context,
    enqueueAsset,
    update,
    runtime: {
      entities: context.entityService,
      publishing: {
        delegated: () => true,
        assetJob: (_entityType, attachmentType) =>
          assetJobTypes[attachmentType],
        update,
        enqueueAsset,
      },
      permissions: context.permissions,
      attachments: context.attachments,
      messaging: {
        send: (message) =>
          context.messaging.send({
            type: message.type,
            payload: message.payload,
          }),
        publish: async ({ topic, data }): Promise<void> => {
          await context.messaging.send({
            type: topic,
            payload: data,
            broadcast: true,
          });
        },
      },
      jobs: {
        active: async (): Promise<never[]> => [],
        recent: async (): Promise<never[]> => [],
        find: async (): Promise<null> => null,
        enqueue: (): never => {
          throw new Error("This test does not declare jobs");
        },
        status: async (): Promise<null> => null,
      },
      state: (scope) => context.runtimeState.scoped(scope),
      logger: context.logger,
    },
  };
}
