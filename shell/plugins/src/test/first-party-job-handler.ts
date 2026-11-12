import type { JobHandler } from "@brains/job-queue";
import { createSilentLogger } from "@brains/test-utils";
import type { Logger } from "@brains/utils/logger";
import {
  firstPartyJobHandlerOf,
  type FirstPartyJobHandler,
} from "../service/first-party-service";

/**
 * The queue's handler for a first-party job, as the runtime registers it,
 * for a test that runs the job without installing its package.
 */
export function firstPartyJobHandlerFor(
  job: FirstPartyJobHandler,
  logger: Logger = createSilentLogger("first-party-job"),
): JobHandler {
  return firstPartyJobHandlerOf(job, { logger, run: (process) => process() });
}
