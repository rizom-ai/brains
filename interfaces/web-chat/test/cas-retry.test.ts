import { describe, expect, it } from "bun:test";
import { attempt, retry } from "../src/cas-retry";

/** Awaited rejection message; Bun types `rejects` matchers as non-thenable. */
const rejection = (run: Promise<unknown>): Promise<string> =>
  run.then(
    () => "resolved",
    (error: unknown) => (error instanceof Error ? error.message : "unknown"),
  );

describe("attempt", () => {
  it("returns the first non-retry result and stops calling the step", async () => {
    let calls = 0;
    const result = await attempt(
      5,
      async (): Promise<number | typeof retry> =>
        ++calls < 3 ? retry : calls * 10,
      (): number => -1,
    );
    expect(result).toBe(30);
    expect(calls).toBe(3);
  });

  it("returns the exhausted value after exactly the bounded number of attempts", async () => {
    let calls = 0;
    const result = await attempt(
      4,
      async (): Promise<string | typeof retry> => {
        calls++;
        return retry;
      },
      (): string => "exhausted",
    );
    expect(result).toBe("exhausted");
    expect(calls).toBe(4);
  });

  it("propagates step errors and lets exhausted throw", async () => {
    expect(
      await rejection(
        attempt(
          2,
          async (): Promise<never> => {
            throw new Error("step failed");
          },
          (): never => {
            throw new Error("unreachable");
          },
        ),
      ),
    ).toBe("step failed");
    expect(
      await rejection(
        attempt(
          0,
          async (): Promise<number | typeof retry> => 1,
          (): number => {
            throw new Error("no attempts");
          },
        ),
      ),
    ).toBe("no attempts");
  });
});
