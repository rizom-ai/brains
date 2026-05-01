import {
  createEnqueueBatchFn,
  createEnqueueJobFn,
  createRegisterHandlerFn,
  type IJobsNamespace,
} from "@brains/job-queue";
import type {
  DefaultQueryResponse,
  IInsightsRegistry,
  QueryContext,
} from "@brains/plugins";
import type { RuntimeAppInfo } from "@brains/plugins";
import type { ShellServices } from "./initialization/shellInitializer";
import { registerSystemCapabilities } from "./system/register";

export interface ShellSystemCapabilityOptions {
  services: ShellServices;
  jobs: IJobsNamespace;
  insights: IInsightsRegistry;
  query: (
    prompt: string,
    context?: QueryContext,
  ) => Promise<DefaultQueryResponse>;
  getAppInfo: () => Promise<RuntimeAppInfo>;
}

export function registerShellSystemCapabilities(
  options: ShellSystemCapabilityOptions,
): void {
  const { services, jobs, insights, query, getAppInfo } = options;
  const jobQueueService = services.jobQueueService;
  const systemLogger = services.logger.child("system");

  const unsubscribe = registerSystemCapabilities(
    {
      entityService: services.entityService,
      entityRegistry: services.entityRegistry,
      jobs: {
        ...jobs,
        enqueue: createEnqueueJobFn(jobQueueService, "system", false),
        enqueueBatch: createEnqueueBatchFn(jobs, "system"),
        registerHandler: createRegisterHandlerFn(jobQueueService, "system"),
      },
      conversationService: services.conversationService,
      logger: systemLogger,
      query,
      getIdentity: () => services.identityService.getCharacter(),
      getProfile: () => services.profileService.getProfile(),
      getAppInfo,
      searchLimit: 10,
      insights,
    },
    services.mcpService,
    services.messageBus,
    systemLogger,
  );
  services.disposables.push(unsubscribe);
}
