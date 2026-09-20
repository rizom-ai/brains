import { describe, expect, it } from "bun:test";
import { caughtError } from "@brains/test-utils";
import {
  completionEffect,
  failureEffect,
  parseWaveId,
  parseWaveTimestamp,
  supersessionEffect,
  type ProjectionWaveStatus,
} from "../src/projection-wave-contracts";

const everyStatus: ProjectionWaveStatus[] = [
  "running",
  "completed",
  "failed",
  "superseded",
];

function refusal(work: () => unknown): unknown {
  try {
    work();
    return undefined;
  } catch (cause) {
    return cause;
  }
}

describe("parseWaveId", () => {
  it("accepts an identifier and trims it", () => {
    expect(parseWaveId("  wave-1 ")).toBe("wave-1");
  });

  it("refuses an empty or blank identifier", () => {
    for (const blank of ["", "   "]) {
      expect(caughtError(refusal(() => parseWaveId(blank)))).toBeInstanceOf(
        Error,
      );
    }
  });
});

describe("parseWaveTimestamp", () => {
  it("accepts a whole non-negative instant", () => {
    expect(parseWaveTimestamp(0)).toBe(0);
    expect(parseWaveTimestamp(1_700_000_000_000)).toBe(1_700_000_000_000);
  });

  it("refuses a negative or fractional instant", () => {
    for (const bad of [-1, 1.5]) {
      expect(
        caughtError(refusal(() => parseWaveTimestamp(bad))),
      ).toBeInstanceOf(Error);
    }
  });
});

describe("completionEffect", () => {
  it("completes a running wave", () => {
    expect(completionEffect("running")).toEqual({ kind: "apply" });
  });

  it("treats completing an already-completed wave as a no-op", () => {
    // Completion is retried by the projection engine, so it must be idempotent
    // rather than an error.
    expect(completionEffect("completed")).toEqual({ kind: "settled" });
  });

  it("refuses to complete a wave that failed or was superseded", () => {
    expect(completionEffect("failed")).toEqual({
      kind: "refuse",
      reason: "already failed",
    });
    expect(completionEffect("superseded")).toEqual({
      kind: "refuse",
      reason: "was superseded",
    });
  });

  it("decides something for every status", () => {
    for (const status of everyStatus)
      expect(completionEffect(status).kind).toBeDefined();
  });
});

describe("failureEffect", () => {
  it("fails a running wave", () => {
    expect(failureEffect("running")).toEqual({ kind: "apply" });
  });

  it("treats failing an already-failed or superseded wave as settled", () => {
    // Both already released their inputs; reporting the same failure twice
    // must not requeue them a second time.
    expect(failureEffect("failed")).toEqual({ kind: "settled" });
    expect(failureEffect("superseded")).toEqual({ kind: "settled" });
  });

  it("refuses to fail a wave that completed", () => {
    expect(failureEffect("completed")).toEqual({
      kind: "refuse",
      reason: "already completed",
    });
  });
});

describe("supersessionEffect", () => {
  it("supersedes a running wave", () => {
    expect(supersessionEffect("running")).toEqual({ kind: "apply" });
  });

  it("treats superseding an already-superseded wave as settled", () => {
    expect(supersessionEffect("superseded")).toEqual({ kind: "settled" });
  });

  it("declines to supersede a wave that has finished either way", () => {
    // Not a refusal: the caller asks "is this stale?" and the answer is no.
    expect(supersessionEffect("completed")).toEqual({ kind: "decline" });
    expect(supersessionEffect("failed")).toEqual({ kind: "decline" });
  });
});
