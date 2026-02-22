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
 * The cast from `Mock<FetchHandler>` to `typeof fetch` is centralized here
 * so test files don't need `as unknown as typeof fetch`.
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
  globalThis.fetch = mock(handler) as unknown as typeof fetch;
}
