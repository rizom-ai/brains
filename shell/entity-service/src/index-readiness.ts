import { Effect, Schedule } from "@brains/utils/effect";
import type { IndexReadinessStatus } from "./types";

interface IndexReadinessPollingOptions {
  intervalMs: number;
  timeoutMs?: number;
}

type IndexReadinessAttempt<E> =
  | { readonly kind: "status"; readonly status: IndexReadinessStatus }
  | { readonly kind: "failure"; readonly error: E };

/**
 * Poll one readiness probe on a single schedule. The optional timeout limits
 * the schedule; without it, polling continues until readiness or interruption.
 * @internal
 */
export function makeIndexReadinessPollingEffect<E>(
  probe: Effect.Effect<IndexReadinessStatus, E>,
  options: IndexReadinessPollingOptions,
): Effect.Effect<IndexReadinessStatus, E> {
  return Effect.suspend(() => {
    let latestAttempt: IndexReadinessAttempt<E> | undefined;

    const attempt: Effect.Effect<IndexReadinessAttempt<E>> = probe.pipe(
      Effect.match({
        onFailure: (error): IndexReadinessAttempt<E> => {
          latestAttempt = { kind: "failure", error };
          return latestAttempt;
        },
        onSuccess: (status): IndexReadinessAttempt<E> => {
          latestAttempt = { kind: "status", status };
          return latestAttempt;
        },
      }),
    );

    const spaced = Schedule.spaced(options.intervalMs);
    const schedule =
      options.timeoutMs === undefined
        ? spaced
        : spaced.pipe(Schedule.upTo(options.timeoutMs));

    return attempt.pipe(
      Effect.repeat({
        schedule,
        until: (result) => result.kind === "status" && result.status.ready,
      }),
      Effect.flatMap(() => {
        if (latestAttempt?.kind === "status") {
          return Effect.succeed(latestAttempt.status);
        }
        if (latestAttempt?.kind === "failure") {
          return Effect.fail(latestAttempt.error);
        }
        return Effect.die(
          new Error("Index readiness polling completed without an attempt"),
        );
      }),
    );
  });
}
