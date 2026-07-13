import { Cause, Effect, Exit } from "effect";

/**
 * Run an internal Effect through a Promise API without exposing FiberFailure.
 * Existing shell callers continue receiving the original failure value.
 */
export async function runEffectPromise<A, E>(
  effect: Effect.Effect<A, E>,
): Promise<A> {
  const exit = await Effect.runPromiseExit(effect);
  if (Exit.isSuccess(exit)) return exit.value;
  throw Cause.squash(exit.cause);
}
