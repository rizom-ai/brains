import { describe, it, expect, beforeEach } from "bun:test";
import { LeadingTrailingDebounce } from "./debounce";

/**
 * Tests for leading + trailing debounce.
 *
 * - First call fires immediately (leading edge)
 * - Subsequent calls within the window are collapsed
 * - After the window settles, fires once more if there were extra calls (trailing edge)
 *
 * Expected: 7 calls within a window → 2 executions (1 leading + 1 trailing)
 */
describe("LeadingTrailingDebounce", () => {
  let callCount: number;
  let debounce: LeadingTrailingDebounce;

  beforeEach(() => {
    callCount = 0;
    debounce = new LeadingTrailingDebounce(() => {
      callCount++;
    }, 100);
  });

  it("should fire immediately on first call (leading edge)", () => {
    debounce.trigger();

    expect(callCount).toBe(1);
  });

  it("should collapse rapid calls into 2 executions (leading + trailing)", async () => {
    for (let i = 0; i < 7; i++) {
      debounce.trigger();
    }

    // Leading edge fired synchronously
    expect(callCount).toBe(1);

    // Wait for debounce window to close
    await sleep(150);

    // Trailing edge fires
    expect(callCount).toBe(2);
  });

  it("should produce 1 execution for a single call (no trailing)", async () => {
    debounce.trigger();

    await sleep(200);

    expect(callCount).toBe(1);
  });

  it("should treat calls after the window as a new leading edge", async () => {
    // First burst
    debounce.trigger();
    debounce.trigger();

    await sleep(200);
    expect(callCount).toBe(2); // 1 leading + 1 trailing

    // Second burst (new window)
    debounce.trigger();
    debounce.trigger();

    expect(callCount).toBe(3); // +1 leading

    await sleep(200);
    expect(callCount).toBe(4); // +1 trailing
  });

  it("should reset trailing timer on each call within the window", async () => {
    debounce.trigger(); // leading fires
    expect(callCount).toBe(1);

    // Call again at ~50ms (within 100ms window) — resets trailing timer
    await sleep(50);
    debounce.trigger();

    // At ~110ms from start: original window would have closed, but timer was reset
    await sleep(60);
    expect(callCount).toBe(1); // trailing hasn't fired yet

    // Wait for the reset timer to fire (100ms from the second call)
    await sleep(100);
    expect(callCount).toBe(2);
  });

  it("should not fire trailing after dispose", async () => {
    debounce.trigger(); // leading
    debounce.trigger(); // schedule trailing
    expect(callCount).toBe(1);

    debounce.dispose();

    await sleep(200);
    expect(callCount).toBe(1); // trailing was cancelled
  });
});

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
