import { describe, expect, it } from "bun:test";
import { sampleGrid, traceContours } from "../src/lib/contours";

const square = { x0: 0, y0: 0, x1: 100, y1: 100, cells: 50 };
/** A hill at the middle: higher nearer (50, 50). */
const hill = (x: number, y: number): number => 50 - Math.hypot(x - 50, y - 50);

describe("contours", () => {
  it("traces the ring where the field crosses a level", () => {
    const [ring] = traceContours(sampleGrid(hill, square), [30], square);
    expect(ring?.startsWith("M")).toBe(true);
    const points = [...(ring ?? "").matchAll(/[ML]([\d.]+) ([\d.]+)/g)].map(
      (match) => [Number(match[1]), Number(match[2])] as const,
    );
    // Height 30 lies 20 from the middle, so every point of the ring does too.
    for (const [x, y] of points) {
      expect(Math.hypot(x - 50, y - 50)).toBeCloseTo(20, 0);
    }
    // Together the pieces go all the way round.
    const quadrants = new Set(
      points.map(([x, y]) => `${x >= 50 ? "e" : "w"}${y >= 50 ? "s" : "n"}`),
    );
    expect(quadrants.size).toBe(4);
  });

  it("draws nothing for a level the field never reaches", () => {
    expect(traceContours(sampleGrid(hill, square), [60], square)).toEqual([""]);
  });

  it("samples the grid's corners and its far edge", () => {
    const heights = sampleGrid((x, y) => x + y, square);
    expect(heights.length).toBe(51 * 51);
    expect(heights[0]).toBe(0);
    expect(heights[heights.length - 1]).toBe(200);
  });

  it("places rings inside any window of the plane", () => {
    const window = { x0: 40, y0: 40, x1: 60, y1: 60, cells: 40 };
    const [ring] = traceContours(sampleGrid(hill, window), [45], window);
    const xs = [...(ring ?? "").matchAll(/[ML]([\d.]+) /g)].map((match) =>
      Number(match[1]),
    );
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(40);
    expect(Math.max(...xs)).toBeLessThanOrEqual(60);
  });
});
