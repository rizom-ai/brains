import type { EventEmitter } from "node:events";

/**
 * Register process signal listeners through EventEmitter's base contract.
 *
 * Bun 1.4 adds a narrow `memoryPressure` overload to `NodeJS.Process`; using
 * the inherited emitter surface keeps ordinary POSIX signals type-safe too.
 */
export function addProcessSignalListeners(
  signals: readonly NodeJS.Signals[],
  listener: () => void,
): () => void {
  const processEvents: EventEmitter = process;
  for (const signal of signals) processEvents.on(signal, listener);

  return (): void => {
    for (const signal of signals)
      processEvents.removeListener(signal, listener);
  };
}
