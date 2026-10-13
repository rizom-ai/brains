import { describe, expect, it } from "bun:test";
import {
  MAX_RESTART_BACKOFF_DOUBLINGS,
  attemptsWithinWindow,
  isRestartBudgetExhausted,
  restartDelayMs,
} from "../src/lib/worker-restart-policy";

const now = 1_700_000_000_000;
const windowMs = 60_000;

describe("attemptsWithinWindow", () => {
  it("keeps an attempt inside the window", () => {
    expect(attemptsWithinWindow([now - 1], now, windowMs)).toEqual([now - 1]);
  });

  it("drops an attempt older than the window", () => {
    expect(attemptsWithinWindow([now - windowMs - 1], now, windowMs)).toEqual(
      [],
    );
  });

  it("drops an attempt exactly at the window edge", () => {
    // The supervisor's own comparison is >= windowMs, so an attempt precisely
    // one window old has aged out.
    expect(attemptsWithinWindow([now - windowMs], now, windowMs)).toEqual([]);
  });

  it("keeps the survivors in order and drops only the old ones", () => {
    const attempts = [
      now - windowMs - 10,
      now - windowMs - 1,
      now - 30_000,
      now - 1,
    ];

    expect(attemptsWithinWindow(attempts, now, windowMs)).toEqual([
      now - 30_000,
      now - 1,
    ]);
  });

  it("has nothing to keep when nothing was attempted", () => {
    expect(attemptsWithinWindow([], now, windowMs)).toEqual([]);
  });
});

describe("restartDelayMs", () => {
  it("restarts immediately the first time, so a one-off crash is invisible", () => {
    expect(restartDelayMs(0, 500)).toBe(0);
  });

  it("waits the base delay after one consecutive failure", () => {
    expect(restartDelayMs(1, 500)).toBe(500);
  });

  it("doubles with each further consecutive failure", () => {
    expect(restartDelayMs(2, 500)).toBe(1_000);
    expect(restartDelayMs(3, 500)).toBe(2_000);
    expect(restartDelayMs(4, 500)).toBe(4_000);
  });

  it("stops doubling at the cap, so the delay cannot run away", () => {
    const capped = 500 * 2 ** MAX_RESTART_BACKOFF_DOUBLINGS;

    expect(restartDelayMs(MAX_RESTART_BACKOFF_DOUBLINGS + 1, 500)).toBe(capped);
    expect(restartDelayMs(MAX_RESTART_BACKOFF_DOUBLINGS + 50, 500)).toBe(
      capped,
    );
  });
});

describe("isRestartBudgetExhausted", () => {
  it("is not exhausted below the budget", () => {
    expect(isRestartBudgetExhausted(2, 3)).toBe(false);
  });

  it("is exhausted at the budget, not one past it", () => {
    expect(isRestartBudgetExhausted(3, 3)).toBe(true);
  });

  it("stays exhausted beyond the budget", () => {
    expect(isRestartBudgetExhausted(4, 3)).toBe(true);
  });
});
