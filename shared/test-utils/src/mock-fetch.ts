import { mock } from "bun:test";

/**
 * Type for a fetch handler used in tests.
 * Returns a partial Response (tests typically only need `ok`, `json`, `status`).
 */
export type FetchHandler = (
  url: string,
  options: RequestInit,
) => Promise<Partial<Response>>;

/**
 * Replace `globalThis.fetch` with a mock function.
 *
 * Unlike the other factories here, this one cannot be checked against the type
 * it stands in for: `FetchHandler` deliberately returns a `Partial<Response>`
 * so tests can supply just `ok`/`status`/`json`, and no partial object is
 * assignable to `typeof fetch`. Requiring real `Response` instances would make
 * every call site heavier for no added safety, since what is being replaced is
 * a global rather than an injected collaborator. The cast is kept here, once,
 * rather than repeated in every test file.
 *
 * @example
 * ```ts
 * const originalFetch = globalThis.fetch;
 * afterEach(() => { globalThis.fetch = originalFetch; });
 *
 * mockFetch(() => Promise.resolve({ ok: true, json: () => Promise.resolve({}) }));
 * ```
 */
export function mockFetch(handler: FetchHandler): void {
  // A partial-Response fetch double has no assignable form to check against,
  // and what is replaced here is a global rather than an injected
  // collaborator, so there is no interface for it to drift from.
  // eslint-disable-next-line no-restricted-syntax, @typescript-eslint/consistent-type-assertions -- see the note above
  globalThis.fetch = mock(handler) as unknown as typeof fetch;
}
