import { describe, expect, test } from "bun:test";
import { waitUntil } from "../src/wait-until";
import { caughtError } from "../src/caught-error";

describe("waitUntil", () => {
  test("returns as soon as the predicate holds", async () => {
    let calls = 0;
    await waitUntil(() => {
      calls += 1;
      return calls >= 3;
    }, "three calls");

    expect(calls).toBe(3);
  });

  test("does not poll again once the predicate already holds", async () => {
    let calls = 0;
    await waitUntil(() => {
      calls += 1;
      return true;
    }, "immediate");

    expect(calls).toBe(1);
  });

  test("awaits an async predicate", async () => {
    let calls = 0;
    await waitUntil(async () => {
      calls += 1;
      return calls >= 2;
    }, "async predicate");

    expect(calls).toBe(2);
  });

  test("rejects with the description when the deadline passes", async () => {
    let thrown: unknown;
    try {
      await waitUntil(() => false, "the job to finish", { timeoutMs: 30 });
    } catch (error) {
      thrown = error;
    }

    expect(caughtError(thrown).message).toContain("the job to finish");
  });

  test("reports how long it waited so a slow machine is distinguishable", async () => {
    let thrown: unknown;
    try {
      await waitUntil(() => false, "never", { timeoutMs: 30 });
    } catch (error) {
      thrown = error;
    }

    expect(caughtError(thrown).message).toMatch(/\d+ms/);
  });

  test("surfaces a predicate that throws rather than waiting out the clock", async () => {
    let thrown: unknown;
    try {
      await waitUntil(
        () => {
          throw new Error("predicate exploded");
        },
        "anything",
        { timeoutMs: 1000 },
      );
    } catch (error) {
      thrown = error;
    }

    expect(caughtError(thrown).message).toBe("predicate exploded");
  });
});
