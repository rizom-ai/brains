import { mock } from "bun:test";

/**
 * Wrap every function member of a namespace in a recording spy, keeping the
 * original implementation.
 *
 * The context factories build real namespaces containing plain functions, but
 * tests widely assert with `expect(context.jobs.enqueue).toHaveBeenCalledWith(...)`,
 * which requires a bun mock. Wrapping keeps both properties: the real
 * implementation still runs, and the call is recorded.
 *
 * The assertion at the end is unavoidable — `Object.fromEntries` erases the
 * mapped type — and it is safe because the mapping preserves every key and
 * wraps functions in a spy of the same call signature. It must not be used to
 * add, drop, or reshape members.
 */
export function spyOnMembers<T extends object>(namespace: T): T {
  return Object.fromEntries(
    Object.entries(namespace).map(([key, value]) => [
      key,
      typeof value === "function"
        ? mock(value as (...args: unknown[]) => unknown)
        : value,
    ]),
  ) as T;
}
