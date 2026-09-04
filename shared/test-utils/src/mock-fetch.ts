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
  // Three separate gaps, each confirmed by removing the assertion and reading
  // the error: `typeof fetch` also carries `preconnect`, which a `mock()` does
  // not have; `FetchHandler` narrows the first parameter to `string` where
  // fetch accepts `RequestInfo | URL`; and `Partial<Response>` is not a
  // `Response`. Closing all three means real `Response` instances and a
  // widened parameter at all 20 call sites, to double a global that no
  // interface is checked against.
  // eslint-disable-next-line no-restricted-syntax, @typescript-eslint/consistent-type-assertions -- see the note above
  globalThis.fetch = mock(handler) as unknown as typeof fetch;
}
