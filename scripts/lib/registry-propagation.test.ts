import { describe, expect, test } from "bun:test";
import {
  REGISTRY_PROPAGATION_DEADLINE_MS,
  RegistryNotReady,
  untilPublished,
} from "./registry-propagation";

/** A clock that only moves when the wait sleeps. */
function clock(): {
  now: () => number;
  sleep: (ms: number) => Promise<void>;
  delays: number[];
} {
  let time = 0;
  const delays: number[] = [];
  return {
    now: (): number => time,
    sleep: async (ms: number): Promise<void> => {
      delays.push(ms);
      time += ms;
    },
    delays,
  };
}

describe("waiting for a fresh publish to reach the registry", () => {
  test("keeps checking until the registry serves the version", async () => {
    const time = clock();
    let calls = 0;
    const result = await untilPublished(
      async () => {
        calls += 1;
        if (calls < 3) throw new RegistryNotReady("not served yet");
        return "served";
      },
      { now: time.now, sleep: time.sleep },
    );
    expect(result).toBe("served");
    expect(time.delays).toEqual([2000, 4000]);
  });

  test("waits out slow propagation up to the deadline, a minute at most between checks", async () => {
    const time = clock();
    const error = await untilPublished(
      async () => {
        throw new RegistryNotReady("still 404");
      },
      { now: time.now, sleep: time.sleep },
    ).catch((error: unknown) => error);
    expect(error).toBeInstanceOf(RegistryNotReady);
    expect(Math.max(...time.delays)).toBe(60_000);
    const waited = time.delays.reduce((sum, ms) => sum + ms, 0);
    // npm has taken over 20 minutes to serve a new version.
    expect(waited).toBeGreaterThan(25 * 60_000);
    expect(waited).toBeLessThanOrEqual(REGISTRY_PROPAGATION_DEADLINE_MS);
  });

  test("fails at once on anything but propagation", async () => {
    const time = clock();
    const error = await untilPublished(
      async () => {
        throw new Error("integrity mismatch");
      },
      { now: time.now, sleep: time.sleep },
    ).catch((error: unknown) => error);
    expect(error).toMatchObject({ message: "integrity mismatch" });
    expect(time.delays).toEqual([]);
  });
});
