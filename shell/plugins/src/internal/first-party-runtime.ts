/**
 * How a first-party runtime rides on a slot context the brain built: under
 * a symbol no public type names, read back only by the accessor that knows
 * it. A context the brain did not build, such as a test double, carries
 * none, and the accessor refuses it.
 */
export function attachFirstPartyRuntime<TContext extends object>(
  context: TContext,
  key: symbol,
  runtime: object,
): TContext {
  Object.defineProperty(context, key, {
    value: runtime,
    enumerable: false,
    writable: false,
    configurable: false,
  });
  return context;
}

/** The runtime a context carries under `key`, or none. */
export function firstPartyRuntimeOf(
  context: object,
  key: symbol,
): object | undefined {
  const runtime: unknown = Reflect.get(context, key);
  return typeof runtime === "object" && runtime !== null ? runtime : undefined;
}
