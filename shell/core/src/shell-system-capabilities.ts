import {
  createEnqueueBatchFn,
  createEnqueueJobFn,
  createRegisterHandlerFn,
  type IJobsNamespace,
  type JobsNamespace,
} from "@brains/job-queue";
import type {
  DefaultQueryResponse,
  IInsightsRegistry,
  QueryContext,
} from "@brains/plugins";
import {
  createAttachmentsNamespace,
  type RuntimeAppInfo,
} from "@brains/plugins";
import type { ShellServices } from "./types/shell-types";
import { registerSystemCapabilities } from "./system/register";
import {
  ConversationProjectionBackfill,
  conversationProjectionBackfillStateSchema,
} from "./conversation-projection-backfill";

export interface ShellSystemCapabilityOptions {
  services: ShellServices;
  jobs: IJobsNamespace;
  insights: IInsightsRegistry;
  query: (
    prompt: string,
    context?: QueryContext,
  ) => Promise<DefaultQueryResponse>;
  getAppInfo: () => Promise<RuntimeAppInfo>;
  resumeBackfill?: boolean | undefined;
}

interface ShellSystemRuntime {
  jobs: JobsNamespace;
  conversationProjectionBackfill: ConversationProjectionBackfill;
}

const systemRuntimes = new WeakMap<ShellServices, ShellSystemRuntime>();

function getSystemRuntime(
  services: ShellServices,
  jobs: IJobsNamespace,
): ShellSystemRuntime {
  const existing = systemRuntimes.get(services);
  if (existing) return existing;
  const systemLogger = services.logger.child("system");
  const systemJobs: JobsNamespace = {
    ...jobs,
    enqueue: createEnqueueJobFn(services.jobQueueService, "system", false),
    enqueueBatch: createEnqueueBatchFn(jobs, "system"),
    registerHandler: createRegisterHandlerFn(
      services.jobQueueService,
      "system",
    ),
  };
  const runtime: ShellSystemRuntime = {
    jobs: systemJobs,
    conversationProjectionBackfill: new ConversationProjectionBackfill({
      conversations: services.conversationService,
      projectionStore: services.entityService.getProjectionStore(),
      state: services.runtimeStateService.scoped({
        namespace: "projection.conversation-backfill",
        schema: conversationProjectionBackfillStateSchema,
      }),
      jobs: systemJobs,
      logger: systemLogger,
    }),
  };
  systemRuntimes.set(services, runtime);
  return runtime;
}

/** Register durable system handlers before the queue registration fence. */
export function registerShellSystemJobHandlers(
  services: ShellServices,
  jobs: IJobsNamespace,
): void {
  getSystemRuntime(
    services,
    jobs,
  ).conversationProjectionBackfill.registerHandler();
}

export function registerShellSystemCapabilities(
  options: ShellSystemCapabilityOptions,
): void {
  const { services, jobs, insights, query, getAppInfo } = options;
  const systemLogger = services.logger.child("system");
  const { jobs: systemJobs, conversationProjectionBackfill } = getSystemRuntime(
    services,
    jobs,
  );
  if (options.resumeBackfill !== false) {
    void conversationProjectionBackfill.resumeActiveRun().catch((error) => {
      systemLogger.error(
        "Failed to resume conversation projection backfill",
        error,
      );
    });
  }

  const unsubscribe = registerSystemCapabilities(
    {
      entityService: services.entityService,
      entityRegistry: services.entityRegistry,
      jobs: systemJobs,
      conversationService: services.conversationService,
      runtimeUploads: services.runtimeUploadRegistry,
      attachments: createAttachmentsNamespace(services.attachmentRegistry),
      logger: systemLogger,
      query,
      getIdentity: () => services.identityService.getCharacter(),
      getProfile: () => services.profileService.getProfile(),
      getAppInfo,
      searchLimit: 10,
      insights,
      permissionService: services.permissionService,
      conversationProjectionBackfill,
    },
    services.mcpService,
    services.messageBus,
    systemLogger,
  );
  services.disposables.push(unsubscribe);
}
