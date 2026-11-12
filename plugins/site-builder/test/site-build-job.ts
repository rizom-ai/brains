import { firstPartyJobHandlerFor } from "@brains/plugins/test";
import type { Logger } from "@brains/utils/logger";
import type { ProgressReporter } from "@brains/utils/progress";
import {
  SiteBuild,
  siteBuildJob,
  type SiteBuildJobHandlerConfig,
} from "../src/handlers/siteBuildJobHandler";
import {
  siteBuildJobSchema,
  type SiteBuildJobData,
  type SiteBuildJobResult,
} from "../src/types/job-types";

/** The site build job as the queue holds it, its data and result typed. */
export interface SiteBuildTestHandler {
  readonly exclusive: boolean | undefined;
  readonly executionTimeoutMs: number | undefined;
  validateAndParse(data: unknown): SiteBuildJobData | null;
  process(
    data: SiteBuildJobData,
    jobId: string,
    progress: ProgressReporter,
  ): Promise<SiteBuildJobResult>;
}

type SiteBuildMessaging = ConstructorParameters<typeof SiteBuild>[1];

/**
 * The site build job: its schema, deadline and exclusivity read through the
 * handler the queue holds, and a build run as the job runs one.
 */
export function createSiteBuildJobHandler(
  logger: Logger,
  messaging: SiteBuildMessaging,
  cfg: SiteBuildJobHandlerConfig,
): SiteBuildTestHandler {
  const handler = firstPartyJobHandlerFor(
    siteBuildJob(logger, messaging, cfg),
    logger,
  );
  return {
    exclusive: handler.exclusive,
    executionTimeoutMs: handler.executionTimeoutMs,
    validateAndParse: (data): SiteBuildJobData | null => {
      const parsed = handler.validateAndParse(data);
      return parsed === null ? null : siteBuildJobSchema.parse(parsed);
    },
    process: (data, jobId, progress): Promise<SiteBuildJobResult> =>
      new SiteBuild(logger, messaging, cfg).process(data, jobId, progress),
  };
}
