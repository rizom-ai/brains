import { afterEach, beforeEach, expect, spyOn } from "bun:test";

/**
 * A suite that builds real chat adapters makes no network call: a Slack or
 * Discord adapter that reaches its API, or anything else that does, is
 * refused here and fails the test.
 */
export function refuseNetwork(): void {
  let attempts: string[] = [];
  let spy: { mockRestore(): void } | undefined;

  beforeEach(() => {
    attempts = [];
    const refused: typeof fetch = Object.assign(
      (input: string | URL | Request): Promise<Response> => {
        attempts.push(input instanceof Request ? input.url : String(input));
        return Promise.reject(new Error("This suite makes no network calls"));
      },
      { preconnect: (): void => {} },
    );
    spy = spyOn(globalThis, "fetch").mockImplementation(refused);
  });

  afterEach(() => {
    spy?.mockRestore();
    spy = undefined;
    expect(attempts).toEqual([]);
  });
}
