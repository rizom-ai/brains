import { describe, it, expect, beforeEach, afterEach, jest } from "bun:test";
import { LeadingTrailingDebounce, TrailingDebounce } from "../src/debounce";

// Elapsed time is the behaviour under test here, so drive the clock rather
// than sleeping past the debounce window and hoping. Real timers made these
// assertions depend on the machine keeping up: a scheduling hiccup longer than
// the margin would fail them, and the margin cost wall clock on every run.
beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

describe("TrailingDebounce", () => {
  it("does not fire before the quiet window elapses", () => {
    let calls = 0;
    const debounce = new TrailingDebounce(() => calls++, 40);

    debounce.trigger();
    expect(calls).toBe(0);

    jest.advanceTimersByTime(39);
    expect(calls).toBe(0);

    jest.advanceTimersByTime(1);
    expect(calls).toBe(1);
  });

  it("collapses rapid triggers into one trailing call", () => {
    let calls = 0;
    const debounce = new TrailingDebounce(() => calls++, 40);

    debounce.trigger();
    debounce.trigger();
    debounce.trigger();
    jest.advanceTimersByTime(40);

    expect(calls).toBe(1);
  });

  it("resets the window on each trigger", () => {
    let calls = 0;
    const debounce = new TrailingDebounce(() => calls++, 50);

    debounce.trigger();
    jest.advanceTimersByTime(30);
    debounce.trigger();
    jest.advanceTimersByTime(30);
    // 60ms since the first trigger, but only 30ms since the last one.
    expect(calls).toBe(0);

    jest.advanceTimersByTime(20);
    expect(calls).toBe(1);
  });

  it("cancels on dispose", () => {
    let calls = 0;
    const debounce = new TrailingDebounce(() => calls++, 30);

    debounce.trigger();
    debounce.dispose();
    jest.advanceTimersByTime(60);

    expect(calls).toBe(0);
  });
});

describe("LeadingTrailingDebounce", () => {
  it("fires immediately on the first trigger", () => {
    let calls = 0;
    const debounce = new LeadingTrailingDebounce(() => calls++, 40);

    debounce.trigger();
    expect(calls).toBe(1);
  });

  it("fires a trailing call only when extra triggers arrived", () => {
    let calls = 0;
    const debounce = new LeadingTrailingDebounce(() => calls++, 40);

    debounce.trigger();
    debounce.trigger();
    jest.advanceTimersByTime(40);

    expect(calls).toBe(2);
  });

  it("fires no trailing call when the first trigger stood alone", () => {
    let calls = 0;
    const debounce = new LeadingTrailingDebounce(() => calls++, 40);

    debounce.trigger();
    jest.advanceTimersByTime(40);

    expect(calls).toBe(1);
  });
});
