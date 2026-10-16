import { describe, expect, it } from "bun:test";
import { formatAge } from "../src";

const NOW = new Date("2026-10-15T12:00:00.000Z");
const ago = (ms: number): string => new Date(NOW.getTime() - ms).toISOString();

describe("formatAge", () => {
  it("says now under a minute", () => {
    expect(formatAge(ago(20_000), NOW)).toBe("now");
  });

  it("counts minutes, hours, then days", () => {
    expect(formatAge(ago(5 * 60_000), NOW)).toBe("5m");
    expect(formatAge(ago(2 * 3_600_000), NOW)).toBe("2h");
    expect(formatAge(ago(3 * 86_400_000), NOW)).toBe("3d");
  });
});
