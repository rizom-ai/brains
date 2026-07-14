import { describe, expect, it } from "bun:test";
import { ActiveTurnSupervisor } from "../src/active-turn-supervisor";

describe("ActiveTurnSupervisor", () => {
  it("interrupts a turn with the original abort reason", async () => {
    const supervisor = new ActiveTurnSupervisor();
    const controller = new AbortController();
    const abortReason = new Error("request cancelled");
    let receivedSignal: AbortSignal | undefined;

    const turn = supervisor.run((signal) => {
      receivedSignal = signal;
      return new Promise<void>(() => {});
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
      return new Promise<void>(() => {});
    });
    const settled = turn.then(
      () => undefined,
      () => undefined,
    );

    await supervisor.close();
    await settled;

    expect(receivedSignal?.aborted).toBe(true);
  });
});
