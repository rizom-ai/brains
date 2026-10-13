import { describe, expect, it } from "bun:test";
import {
  isInterruptedDelivery,
  staleDeliveryCutoff,
} from "../src/invitation-recovery";

const now = 1_700_000_000_000;
const staleMs = 5 * 60 * 1000;
const cutoff = staleDeliveryCutoff(now, staleMs);

describe("staleDeliveryCutoff", () => {
  it("is the moment before which a delivery counts as interrupted", () => {
    expect(cutoff).toBe(now - staleMs);
  });
});

describe("isInterruptedDelivery", () => {
  it("counts a queued attempt that has sat past the cutoff", () => {
    expect(
      isInterruptedDelivery(
        { state: "queued", queuedAt: cutoff - 1, startedAt: null },
        cutoff,
      ),
    ).toBe(true);
  });

  it("counts a queued attempt exactly at the cutoff", () => {
    // The SQL side uses <=, and the two must agree or recovery either misses
    // deliveries it selected or re-sends ones it did not.
    expect(
      isInterruptedDelivery(
        { state: "queued", queuedAt: cutoff, startedAt: null },
        cutoff,
      ),
    ).toBe(true);
  });

  it("leaves a queued attempt younger than the cutoff alone", () => {
    expect(
      isInterruptedDelivery(
        { state: "queued", queuedAt: cutoff + 1, startedAt: null },
        cutoff,
      ),
    ).toBe(false);
  });

  it("counts a sending attempt that started before the cutoff", () => {
    expect(
      isInterruptedDelivery(
        { state: "sending", queuedAt: cutoff - 10, startedAt: cutoff - 1 },
        cutoff,
      ),
    ).toBe(true);
  });

  it("leaves a sending attempt that started after the cutoff alone", () => {
    expect(
      isInterruptedDelivery(
        { state: "sending", queuedAt: cutoff - 10, startedAt: cutoff + 1 },
        cutoff,
      ),
    ).toBe(false);
  });

  it("never counts a sending attempt with no start time", () => {
    // SQL comparisons against NULL do not match, so the predicate must not
    // either; treating it as stale would resend a delivery that may be running.
    expect(
      isInterruptedDelivery(
        { state: "sending", queuedAt: cutoff - 10, startedAt: null },
        cutoff,
      ),
    ).toBe(false);
  });

  it("never counts an attempt that has already finished", () => {
    for (const state of ["sent", "failed", "delivered"]) {
      expect(
        isInterruptedDelivery(
          { state, queuedAt: cutoff - 10, startedAt: cutoff - 5 },
          cutoff,
        ),
      ).toBe(false);
    }
  });
});
