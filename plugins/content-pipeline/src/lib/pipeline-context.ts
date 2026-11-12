import type {
  ClassRuntimeState,
  ServiceAttachments,
  ServiceClassJobs,
  ServiceEntityReads,
  ServiceEntityWrites,
  ServicePermissions,
} from "@brains/sdk/internal/service-runtime";
import type { Logger } from "@brains/utils/logger";

/**
 * What the pipeline reads, writes, checks and queues through, as its class
 * did through its plugin context: records of any publishable type, the
 * brain's entity action policy, the attachments other packages provide,
 * the job queue, and its queue's runtime state under the namespace the
 * class named.
 */
export interface PipelineContext {
  readonly logger: Logger;
  readonly entityService: Pick<
    ServiceEntityReads,
    "getEntity" | "getEntityRaw" | "listEntities"
  > &
    Pick<ServiceEntityWrites, "updateEntity">;
  readonly permissions: ServicePermissions;
  readonly attachments: ServiceAttachments;
  readonly jobs: Pick<ServiceClassJobs, "enqueue" | "getActiveJobs">;
  readonly runtimeState: ClassRuntimeState;
}
