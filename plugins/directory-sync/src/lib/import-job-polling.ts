import { Cause, Clock, Effect, Exit, Schedule } from "@brains/utils/effect";
import type { Clock as ClockType } from "@brains/utils/effect";
import type { ServicePluginContext } from "@brains/plugins";
import type { Logger } from "@brains/utils/logger";
import type { ProgressReporter } from "@brains/utils/progress";

const DEFAULT_MAX_WAIT_MS = 300_000;
const DEFAULT_POLL_INTERVAL_MS = 500;

interface ImportJobPollingOptions {
  jobIds: string[];
  entityService: ServicePluginContext["entityService"];
  reporter: ProgressReporter;
  logger: Logger;
  clock?: ClockType.Clock | undefined;
  maxWaitMs?: number | undefined;
  pollIntervalMs?: number | undefined;
}

/** Await import jobs on one deterministic, non-overlapping schedule. @internal */
export async function waitForImportJobs(
  options: ImportJobPollingOptions,
): Promise<void> {
  if (options.jobIds.length === 0) return;

  const maxWaitMs = options.maxWaitMs ?? DEFAULT_MAX_WAIT_MS;
  const pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  options.logger.debug(
    `Waiting for ${options.jobIds.length} import jobs to complete`,
  );

  const polling = Effect.gen(function* () {
    const startedAt = yield* Clock.currentTimeMillis;
    const attempt = Effect.gen(function* () {
      const statuses = yield* Effect.tryPromise({
        try: () =>
          Promise.all(
            options.jobIds.map((id) =>
              options.entityService.getAsyncJobStatus(id),
            ),
          ),
        catch: (error) => error,
      });
      const completed = statuses.filter(
        (status) =>
          status &&
          (status.status === "completed" || status.status === "failed"),
      ).length;

      if (completed === options.jobIds.length) {
        options.logger.debug("All import jobs completed");
        return true;
      }

      const now = yield* Clock.currentTimeMillis;
      if (now - startedAt > maxWaitMs) {
        options.logger.warn(
          `Timeout waiting for import jobs (${completed}/${options.jobIds.length} completed)`,
        );
        return true;
      }

      const percentage = Math.round((completed / options.jobIds.length) * 100);
      yield* Effect.tryPromise({
        try: () =>
          options.reporter.report({
            progress: 50 + Math.round(percentage * 0.05),
            message: `Processing ${completed}/${options.jobIds.length} entities`,
          }),
        catch: (error) => error,
      });
      return false;
    });

    yield* attempt.pipe(
      Effect.repeat({
        schedule: Schedule.spaced(pollIntervalMs),
        until: (done) => done,
      }),
    );
  });
  const ownedPolling = options.clock
    ? Effect.withClock(polling, options.clock)
    : polling;
  const result = await Effect.runPromiseExit(ownedPolling);
  if (Exit.isFailure(result)) throw Cause.squash(result.cause);
}
