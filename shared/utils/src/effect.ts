// Canonical internal Effect boundary. Keep exports curated so workspace packages
// do not depend on Effect's broad root surface independently.
import { Clock, Effect, Layer, Result } from "effect";
import type { Context as EffectContext } from "effect";

export {
  Cause,
  Clock,
  Context,
  Effect,
  Result,
  Exit,
  Fiber,
  FiberMap,
  FiberSet,
  Layer,
  Option,
  Schedule,
  Scope,
} from "effect";

/** A service paired with the teardown that releases whatever it owns. */
export interface ScopedService<TService> {
  service: TService;
  close: () => void;
}

/**
 * Provide a service that owns a resource — a database handle, a worker — for
 * the lifetime of the layer's scope, closing it on release.
 *
 * The shell's service layers all want exactly this: acquire synchronously,
 * close synchronously, hand the tag the service. Building it by hand meant
 * repeating the `Layer.effect` / `Effect.acquireRelease` / `Effect.sync`
 * nesting in each one, where the release step is easy to get subtly wrong.
 */
export function scopedServiceLayer<TId, TService>(
  tag: EffectContext.Service<TId, TService>,
  acquire: () => ScopedService<TService>,
): Layer.Layer<TId> {
  return Layer.effect(
    tag,
    Effect.acquireRelease(Effect.sync(acquire), (resource) =>
      Effect.sync(() => {
        resource.close();
      }),
    ).pipe(Effect.map((resource) => resource.service)),
  );
}

/** Inject timing without changing an effect's other service requirements. */
export function withOptionalClock<A, E, R>(
  effect: Effect.Effect<A, E, R>,
  clock?: Clock.Clock,
): Effect.Effect<A, E, R> {
  return clock ? Effect.provideService(effect, Clock.Clock, clock) : effect;
}

/**
 * Run sibling Promise operations concurrently, settling every operation before
 * rethrowing the first failure in declaration order.
 */
export async function runConcurrentPhase(
  operations: ReadonlyArray<() => Promise<void>>,
): Promise<void> {
  const results = await Effect.runPromise(
    Effect.all(
      operations.map((operation) =>
        Effect.result(
          Effect.tryPromise({
            try: operation,
            catch: (error) => error,
          }),
        ),
      ),
      { concurrency: "unbounded" },
    ),
  );
  const firstFailure = results.find(Result.isFailure);
  if (firstFailure) throw firstFailure.failure;
}
