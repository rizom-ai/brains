// Canonical internal Effect boundary. Keep exports curated so workspace packages
// do not depend on Effect's broad root surface independently.
import { Effect, Layer } from "effect";
import type { Context as EffectContext } from "effect";

export {
  Cause,
  Clock,
  Context,
  Effect,
  Either,
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
 * repeating the `Layer.scoped` / `Effect.acquireRelease` / `Effect.sync`
 * nesting in each one, where the release step is easy to get subtly wrong.
 */
export function scopedServiceLayer<TId, TService>(
  tag: EffectContext.Tag<TId, TService>,
  acquire: () => ScopedService<TService>,
): Layer.Layer<TId> {
  return Layer.scoped(
    tag,
    Effect.acquireRelease(Effect.sync(acquire), (resource) =>
      Effect.sync(() => {
        resource.close();
      }),
    ).pipe(Effect.map((resource) => resource.service)),
  );
}
