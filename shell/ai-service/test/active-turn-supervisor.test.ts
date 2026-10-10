import { describe, expect, it, spyOn } from "bun:test";
import { setImmediate as nextTurn } from "node:timers/promises";
import { deferred } from "@brains/utils/deferred";
import { Effect, Scope } from "@brains/utils/effect";
import { ActiveTurnSupervisor } from "../src/active-turn-supervisor";

function waitForAbort(signal: AbortSignal): Promise<void> {
  return new Promise((_resolve, reject) => {
    signal.throwIfAborted();
    signal.addEventListener("abort", () => reject(signal.reason), {
      once: true,
    });
  });
}

describe("ActiveTurnSupervisor", () => {
  it("interrupts a turn with the original abort reason", async () => {
    const supervisor = new ActiveTurnSupervisor();
    const controller = new AbortController();
    const abortReason = new Error("request cancelled");
    let receivedSignal: AbortSignal | undefined;

    const turn = supervisor.run((signal) => {
      receivedSignal = signal;
      return waitForAbort(signal);
    }, controller.signal);

    controller.abort(abortReason);

    let receivedError: unknown;
    try {
      await turn;
    } catch (error) {
      receivedError = error;
    }

    expect(receivedError).toBe(abortReason);
    expect(receivedSignal?.aborted).toBe(true);
    await supervisor.close();
  });

  it("interrupts active turns when closed", async () => {
    const supervisor = new ActiveTurnSupervisor();
    let receivedSignal: AbortSignal | undefined;
    const turn = supervisor.run((signal) => {
      receivedSignal = signal;
      return waitForAbort(signal);
    });
    const settled = turn.then(
      () => undefined,
      () => undefined,
    );

    await supervisor.close();
    await settled;

    expect(receivedSignal?.aborted).toBe(true);
  });

  it.each(["resolve", "reject", "scope-failure"] as const)(
    "drains cancellation-ignoring work before close settles (%s)",
    async (outcome) => {
      const supervisor = new ActiveTurnSupervisor();
      const entered = deferred();
      const work = deferred();
      let receivedSignal: AbortSignal | undefined;
      const turn = supervisor.run((signal) => {
        receivedSignal = signal;
        entered.resolve();
        return work.promise;
      });
      const observedTurn = turn.then(
        () => true,
        () => false,
      );
      await entered.promise;
      const closeFailure = new Error("Turn scope close failed");
      const originalClose = Scope.close;
      const scopeClose =
        outcome === "scope-failure"
          ? spyOn(Scope, "close").mockImplementation((scope, exit) =>
              originalClose(scope, exit).pipe(
                Effect.andThen(Effect.die(closeFailure)),
              ),
            )
          : undefined;
      const closing = supervisor.close();
      let settled = false;
      const observedClose = closing
        .then(
          () => ({ success: true as const }),
          (error: unknown) => ({ success: false as const, error }),
        )
        .finally(() => {
          settled = true;
        });
      try {
        expect(supervisor.close()).toBe(closing);
        expect(
          await supervisor
            .run(async () => "late")
            .catch((error: unknown) => error),
        ).toEqual(new Error("Agent service has been shut down"));
        expect(await observedTurn).toBe(false);
        await nextTurn();
        expect(receivedSignal?.aborted).toBe(true);
        expect(settled).toBe(false);
        if (outcome === "reject")
          work.reject(new Error("Late operation failure"));
        else work.resolve();
        const result = await observedClose;
        expect(result.success).toBe(outcome !== "scope-failure");
        if (!result.success) expect(result.error).toBe(closeFailure);
      } finally {
        work.resolve();
        await Promise.allSettled([observedTurn, observedClose]);
        scopeClose?.mockRestore();
      }
    },
  );

  it("retains work whose caller already observed cancellation", async () => {
    const supervisor = new ActiveTurnSupervisor();
    const controller = new AbortController();
    const reason = Object.freeze({ message: "Caller disconnected" });
    const work = deferred();
    const turn = supervisor.run(() => work.promise, controller.signal);
    controller.abort(reason);
    expect(await turn.catch((error: unknown) => error)).toBe(reason);
    let settled = false;
    const closing = supervisor.close().then(() => {
      settled = true;
    });
    try {
      await nextTurn();
      expect(settled).toBe(false);
    } finally {
      work.resolve();
      await closing;
    }
    expect(settled).toBe(true);
  });

  it("admits independent turns concurrently and drains every sibling", async () => {
    const supervisor = new ActiveTurnSupervisor();
    const entered = deferred();
    const gates = [deferred(), deferred()];
    let calls = 0;
    const turns = gates.map((gate) =>
      supervisor
        .run(() => {
          calls += 1;
          if (calls === 2) entered.resolve();
          return gate.promise;
        })
        .catch((error: unknown) => error),
    );
    await entered.promise;
    let settled = false;
    const closing = supervisor.close().then(() => {
      settled = true;
    });
    try {
      expect(calls).toBe(2);
      gates[0]?.resolve();
      await nextTurn();
      expect(settled).toBe(false);
    } finally {
      for (const gate of gates) gate.resolve();
      await Promise.allSettled([...turns, closing]);
    }
    expect(settled).toBe(true);
    expect(supervisor.run(async () => "late")).rejects.toThrow(
      "Agent service has been shut down",
    );
  });

  it("joins reentrant close calls from an abort listener", async () => {
    const supervisor = new ActiveTurnSupervisor();
    const work = deferred();
    let fromAbort: Promise<void> | undefined;
    const turn = supervisor
      .run((signal) => {
        signal.addEventListener(
          "abort",
          () => {
            fromAbort = supervisor.close();
          },
          { once: true },
        );
        return work.promise;
      })
      .catch((error: unknown) => error);
    const closing = supervisor.close();
    try {
      await nextTurn();
      expect(fromAbort).toBe(closing);
    } finally {
      work.resolve();
      await Promise.allSettled([turn, closing]);
    }
  });

  it("settles synchronous adapter failures without retaining a dead owner", async () => {
    const supervisor = new ActiveTurnSupervisor();
    const failure = Object.freeze({ message: "Adapter threw" });
    const turn = supervisor.run(() => {
      throw failure;
    });
    expect(await turn.catch((error: unknown) => error)).toBe(failure);
    await supervisor.close();
  });

  it("publishes work ownership before an operation reenters close", async () => {
    const supervisor = new ActiveTurnSupervisor();
    const work = deferred();
    let fromOperation: Promise<void> | undefined;
    const turn = supervisor
      .run(() => {
        fromOperation = supervisor.close();
        return work.promise;
      })
      .catch((error: unknown) => error);
    if (!fromOperation) throw new Error("Operation did not enter close");
    let settled = false;
    const closing = fromOperation.then(() => {
      settled = true;
    });
    try {
      expect(supervisor.close()).toBe(fromOperation);
      await nextTurn();
      expect(settled).toBe(false);
    } finally {
      work.resolve();
      await Promise.allSettled([turn, closing]);
    }
  });
});
