/**
 * Test diagnostics travel beside a response, never on its wire shape. Weak keys
 * retain the thrown value only for the lifetime of that exact response; parallel
 * calls and separate harnesses cannot overwrite one another's diagnostics.
 */
const causes = new WeakMap<object, unknown>();

export function recordToolFailureCause(response: object, cause: unknown): void {
  causes.set(response, cause);
}

export function readToolFailureCause(response: object): unknown {
  return causes.get(response);
}
