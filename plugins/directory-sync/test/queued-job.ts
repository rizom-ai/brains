import type { JobHandler } from "@brains/plugins";
import { firstPartyJobHandlerFor } from "@brains/plugins/test";
import type { Logger } from "@brains/utils/logger";
import type { z } from "@brains/utils/zod";
import { classJob } from "../src/lib/register-job-handlers";

/** A directory-sync handler: its schema and its run. */
type Handler<TInput> = Parameters<typeof classJob<TInput>>[1] & {
  readonly schema: z.ZodType<TInput, unknown>;
};

/**
 * A directory-sync handler as the queue runs it: its data checked by its
 * schema and logged, its failures logged, as directory-sync registers it.
 * What the queue accepted reads as the handler's input.
 */
export function queuedJob<TInput>(
  type: string,
  handler: Handler<TInput>,
  logger?: Logger,
): {
  validateAndParse(data: unknown): TInput | null;
  onError: NonNullable<JobHandler["onError"]>;
} {
  const job = firstPartyJobHandlerFor(classJob(type, handler), logger);
  return {
    validateAndParse: (data): TInput | null => {
      const accepted = job.validateAndParse(data);
      return accepted === null ? null : handler.schema.parse(accepted);
    },
    onError: async (...args): Promise<void> => {
      await job.onError?.(...args);
    },
  };
}
