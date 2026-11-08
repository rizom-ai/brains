import { createContext, type Context } from "react";

/**
 * A React context every copy of this library shares.
 *
 * A site or plugin package installs its own copy of the library, or bundles
 * one, while the brain renders it inside the providers of the copy the brain
 * bundles. A context made per module would leave that package reading an
 * empty one. The context rides `globalThis` under a global-registry symbol
 * instead: `Symbol.for` resolves to the same symbol in every copy, so the
 * first copy to load makes it and the others take it. The key names the
 * contract version, so a copy whose value shape differs uses its own.
 */
export function sharedContext<T>(key: string, defaultValue: T): Context<T> {
  const symbol = Symbol.for(`@rizom/brain-ui/${key}`);
  const existing: unknown = Reflect.get(globalThis, symbol);
  if (existing !== undefined) {
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- Reflect.get returns unknown; the only writer is this function, under a key that names the value's contract version
    return existing as Context<T>;
  }
  const context = createContext(defaultValue);
  Object.defineProperty(globalThis, symbol, {
    value: context,
    enumerable: false,
    configurable: false,
    writable: false,
  });
  return context;
}
