/**
 * The state a declarative definition without a `setup` hook has: none.
 *
 * The public `defineService` / `defineMessageInterface` entry points declare
 * `TState extends object = Record<never, never>`, so when an author omits
 * `setup`, TState *is* the empty record and this value is genuinely of that
 * type. The plugin classes, though, are generic over an arbitrary `object` and
 * cannot see that default — the invariant lives in the public signature, not
 * in the class.
 *
 * The single assertion sits here rather than at each plugin family's fallback.
 */
export function emptyPluginState<TState extends object>(): TState {
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- see the note above: TState defaults to the empty record, so a frozen empty object really is one; the plugin classes are generic over `object` and cannot see that default
  return Object.freeze({}) as TState;
}
