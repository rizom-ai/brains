import { describe, test, expect } from "bun:test";
import {
  calculateETA,
  calculateProgressPercentage,
  formatRate,
  formatDuration,
} from "../../src/utils/progress-calculations";

describe("calculateETA", () => {
  test("returns null for insufficient elapsed time", () => {
    const startTime = new Date(Date.now() - 500); // 500ms ago
    const result = calculateETA(5, 100, startTime);
    expect(result).toBeNull();
  });

  test("returns null for zero current progress", () => {
    const startTime = new Date(Date.now() - 2000); // 2s ago
    const result = calculateETA(0, 100, startTime);
    expect(result).toBeNull();
  });

  test("calculates ETA correctly for normal progress", () => {
    const startTime = new Date(Date.now() - 10000); // 10s ago
    const result = calculateETA(25, 100, startTime); // 25% complete in 10s

    expect(result).not.toBeNull();
    if (result) {
      expect(result.rate).toBeCloseTo(2.5, 1); // 2.5 items per second
      expect(result.etaSeconds).toBeCloseTo(30, 1); // 30s remaining
      expect(result.eta).toBe("30s");
    }
  });

  test("formats ETA in minutes for longer durations", () => {
    const startTime = new Date(Date.now() - 10000); // 10s ago
    const result = calculateETA(10, 100, startTime); // 10% complete in 10s

    expect(result).not.toBeNull();
    if (result) {
      expect(result.rate).toBeCloseTo(1, 1); // 1 item per second
      expect(result.etaSeconds).toBeCloseTo(90, 1); // 90s remaining
      expect(result.eta).toBe("2m"); // Should round to 2 minutes
    }
  });

  test("formats ETA in hours for very long durations", () => {
    const startTime = new Date(Date.now() - 100000); // 100s ago
    const result = calculateETA(1, 100, startTime); // 1% complete in 100s

    expect(result).not.toBeNull();
    if (result) {
      expect(result.rate).toBeCloseTo(0.01, 2); // 0.01 items per second
      expect(result.etaSeconds).toBeCloseTo(9900, 100); // ~2.75 hours remaining
      expect(result.eta).toBe("2h 45m"); // Actual output: 2h 45m
    }
  });

  test("handles edge case of negative rate", () => {
    const startTime = new Date(Date.now() + 1000); // Future time
    const result = calculateETA(10, 100, startTime);
    expect(result).toBeNull();
  });
});

describe("calculateProgressPercentage", () => {
  test("calculates percentage correctly", () => {
    expect(calculateProgressPercentage(25, 100)).toBe(25);
    expect(calculateProgressPercentage(50, 200)).toBe(25);
  });

  test("handles division by zero", () => {
    expect(calculateProgressPercentage(10, 0)).toBe(0);
  });

  test("caps percentage at 100", () => {
    expect(calculateProgressPercentage(150, 100)).toBe(100);
  });

  test("floors percentage at 0", () => {
    expect(calculateProgressPercentage(-10, 100)).toBe(0);
  });
});

describe("formatRate", () => {
  test("formats low rates as per minute", () => {
    expect(formatRate(0.5)).toBe("30.0/min");
    expect(formatRate(0.1)).toBe("6.0/min");
  });

  test("formats medium rates as per second with decimal", () => {
    expect(formatRate(5.7)).toBe("5.7/s");
    expect(formatRate(9.9)).toBe("9.9/s");
  });

  test("formats high rates as rounded per second", () => {
    expect(formatRate(15.7)).toBe("16/s");
    expect(formatRate(100.2)).toBe("100/s");
  });
});

describe("formatDuration", () => {
  test("formats seconds", () => {
    expect(formatDuration(30)).toBe("30s");
    expect(formatDuration(59)).toBe("59s");
  });

  test("formats minutes", () => {
    expect(formatDuration(60)).toBe("1m");
    expect(formatDuration(90)).toBe("2m"); // Rounds 1.5 minutes
    expect(formatDuration(3540)).toBe("59m");
  });

  test("formats hours", () => {
    expect(formatDuration(3600)).toBe("1h");
    expect(formatDuration(3660)).toBe("1h 1m");
    expect(formatDuration(7200)).toBe("2h");
    expect(formatDuration(7260)).toBe("2h 1m");
  });

  test("omits minutes when zero", () => {
    expect(formatDuration(3600)).toBe("1h");
    expect(formatDuration(7200)).toBe("2h");
  });
});
