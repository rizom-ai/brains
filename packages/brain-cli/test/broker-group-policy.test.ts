import { describe, expect, it } from "bun:test";
import {
  brokerReplacementStep,
  isProcessGroupAbsent,
} from "../src/lib/broker-group-policy";

describe("isProcessGroupAbsent", () => {
  it("signals the group, not the process, and asks nothing of it", () => {
    const calls: { target: number; signal: number }[] = [];
    isProcessGroupAbsent((target, signal) => {
      calls.push({ target, signal: Number(signal) });
    }, 4321);

    // A negative pid addresses the whole group; signal 0 only tests for its
    // existence. Sending the positive pid would miss surviving children.
    expect(calls).toEqual([{ target: -4321, signal: 0 }]);
  });

  it("is present when the signal lands", () => {
    expect(isProcessGroupAbsent(() => undefined, 1)).toBe(false);
  });

  it("is absent only on ESRCH", () => {
    const esrch = Object.assign(new Error("no such process"), {
      code: "ESRCH",
    });
    expect(
      isProcessGroupAbsent(() => {
        throw esrch;
      }, 1),
    ).toBe(true);
  });

  it("is not absent when the signal fails for any other reason", () => {
    // EPERM means the group exists and belongs to someone else. Reading that
    // as absence would start a second writer on the same checkout.
    const eperm = Object.assign(new Error("operation not permitted"), {
      code: "EPERM",
    });
    expect(
      isProcessGroupAbsent(() => {
        throw eperm;
      }, 1),
    ).toBe(false);

    expect(
      isProcessGroupAbsent(() => {
        throw new Error("something else entirely");
      }, 1),
    ).toBe(false);
  });
});

describe("brokerReplacementStep", () => {
  it("replaces the broker once the group is proven gone", () => {
    expect(brokerReplacementStep(true, 1, 20)).toEqual({ kind: "replace" });
  });

  it("probes again while attempts remain", () => {
    expect(brokerReplacementStep(false, 1, 20)).toEqual({
      kind: "probe-again",
    });
    expect(brokerReplacementStep(false, 19, 20)).toEqual({
      kind: "probe-again",
    });
  });

  it("gives up at the last attempt rather than one past it", () => {
    expect(brokerReplacementStep(false, 20, 20)).toEqual({ kind: "give-up" });
    expect(brokerReplacementStep(false, 21, 20)).toEqual({ kind: "give-up" });
  });

  it("replaces on a late proof rather than giving up", () => {
    // Absence proven on the final attempt is still proof; the budget only
    // bounds how long we wait for it.
    expect(brokerReplacementStep(true, 20, 20)).toEqual({ kind: "replace" });
  });

  it("never replaces without proof", () => {
    for (let attempt = 1; attempt <= 25; attempt += 1) {
      expect(brokerReplacementStep(false, attempt, 20).kind).not.toBe(
        "replace",
      );
    }
  });
});
