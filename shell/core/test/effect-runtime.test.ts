import { describe, expect, it } from "bun:test";
import { setImmediate as nextTurn } from "node:timers/promises";
import { runConcurrentPhase } from "../src/effect-runtime";

describe("runConcurrentPhase", () => {
  it("accepts an empty phase", async () => {
    expect(await runConcurrentPhase([])).toBeUndefined();
  });

  it("admits independent siblings concurrently and joins all completions", async () => {
    const entered = [
      Promise.withResolvers<void>(),
      Promise.withResolvers<void>(),
    ];
    const release = [
      Promise.withResolvers<void>(),
      Promise.withResolvers<void>(),
    ];
    const finished: number[] = [];
    let phaseSettled = false;
    const phase = runConcurrentPhase(
      release.map((gate, index) => async (): Promise<void> => {
        entered[index]?.resolve();
        await gate.promise;
        finished.push(index);
      }),
    ).then(() => {
      phaseSettled = true;
    });

    await Promise.all(entered.map((gate) => gate.promise));
    expect(finished).toEqual([]);
    release[1]?.resolve();
    await Promise.resolve();
    expect(finished).toEqual([1]);
    expect(phaseSettled).toBe(false);

    release[0]?.resolve();
    await phase;
    expect(finished).toEqual([1, 0]);
  });

  it("settles every sibling before preserving the first original failure", async () => {
    const startupError = new Error("identity initialization failed");
    const failureRaised = Promise.withResolvers<void>();
    const siblingEntered = Promise.withResolvers<void>();
    const siblingGate = Promise.withResolvers<void>();
    let siblingSettled = false;
    let phaseSettled = false;

    const phase = runConcurrentPhase([
      async (): Promise<void> => {
        failureRaised.resolve();
        throw startupError;
      },
      async (): Promise<void> => {
        siblingEntered.resolve();
        await siblingGate.promise;
        siblingSettled = true;
      },
    ]).then(
      () => ({ error: undefined }),
      (error: unknown) => ({ error }),
    );
    void phase.then(() => {
      phaseSettled = true;
    });

    await Promise.all([failureRaised.promise, siblingEntered.promise]);
    // Flush failure propagation after admission, without an elapsed-time wait.
    await nextTurn();
    expect(phaseSettled).toBe(false);

    siblingGate.resolve();
    const result = await phase;

    expect(siblingSettled).toBe(true);
    expect(result.error).toBe(startupError);
  });

  it("selects failure by declaration order, not completion order", async () => {
    const firstFailure = new Error("declared first, rejected last");
    const secondFailure = new Error("declared second, rejected first");
    const releaseFirst = Promise.withResolvers<void>();
    const secondFailed = Promise.withResolvers<void>();
    let phaseSettled = false;
    const phase = runConcurrentPhase([
      async (): Promise<void> => {
        await releaseFirst.promise;
        throw firstFailure;
      },
      async (): Promise<void> => {
        secondFailed.resolve();
        throw secondFailure;
      },
    ]).then(
      () => ({ error: undefined }),
      (error: unknown) => ({ error }),
    );
    void phase.then(() => {
      phaseSettled = true;
    });

    await secondFailed.promise;
    await nextTurn();
    expect(phaseSettled).toBe(false);
    releaseFirst.resolve();
    expect((await phase).error).toBe(firstFailure);
  });

  it("settles admitted siblings after a synchronous callback throw", async () => {
    const failure = new Error("synchronous startup failure");
    const siblingEntered = Promise.withResolvers<void>();
    const releaseSibling = Promise.withResolvers<void>();
    let siblingSettled = false;
    let phaseSettled = false;
    const phase = runConcurrentPhase([
      (): Promise<void> => {
        throw failure;
      },
      async (): Promise<void> => {
        siblingEntered.resolve();
        await releaseSibling.promise;
        siblingSettled = true;
      },
    ]).then(
      () => ({ error: undefined }),
      (error: unknown) => ({ error }),
    );

    void phase.then(() => {
      phaseSettled = true;
    });
    await siblingEntered.promise;
    await nextTurn();
    expect(phaseSettled).toBe(false);
    expect(siblingSettled).toBe(false);
    releaseSibling.resolve();
    expect((await phase).error).toBe(failure);
    expect(siblingSettled).toBe(true);
  });

  it.each([
    ["Error", new Error("original failure")],
    ["object", Object.freeze({ code: "startup_failure" })],
    ["undefined", undefined],
    ["null", null],
    ["string", "startup failed"],
  ])(
    "preserves the exact rejected value (%s)",
    async (_label: string, failure: unknown): Promise<void> => {
      const outcome = await runConcurrentPhase([
        (): Promise<void> => Promise.reject(failure),
      ]).then(
        () => ({ status: "fulfilled" as const }),
        (reason: unknown) => ({ status: "rejected" as const, reason }),
      );

      expect(outcome.status).toBe("rejected");
      if (outcome.status === "rejected") expect(outcome.reason).toBe(failure);
    },
  );
});
