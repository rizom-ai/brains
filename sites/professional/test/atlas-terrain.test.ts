import { describe, expect, it } from "bun:test";
import { atlasPosition, buildAtlasTerrain } from "../src/lib/atlas-terrain";

const zones = [
  { x: 0.3, y: 0.3, members: 4 },
  { x: 0.7, y: 0.6, members: 2 },
];
const items = [
  { x: 0.28, y: 0.35 },
  { x: 0.34, y: 0.25 },
  { x: 0.72, y: 0.58 },
  { x: 0.9, y: 0.1 },
];

function numbers(d: string): number[] {
  return (d.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);
}

describe("atlas terrain", () => {
  it("draws no contours for an empty map", () => {
    expect(buildAtlasTerrain({ zones: [], items: [] })).toEqual([]);
  });

  it("draws closed-form contour paths inside the map's viewBox", () => {
    const contours = buildAtlasTerrain({ zones, items });
    expect(contours.length).toBeGreaterThan(4);
    for (const contour of contours) {
      expect(contour.d.startsWith("M")).toBe(true);
      for (const value of numbers(contour.d)) {
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(100);
      }
      expect(contour.opacity).toBeGreaterThan(0);
      expect(contour.opacity).toBeLessThanOrEqual(1);
    }
  });

  it("marks every fourth level as an index contour, as on a survey map", () => {
    const contours = buildAtlasTerrain({ zones, items });
    const indexLevels = contours.filter((contour) => contour.index);
    expect(indexLevels.length).toBeGreaterThan(0);
    for (const contour of indexLevels) expect(contour.step % 4).toBe(3);
  });

  it("is deterministic, so rebuilds do not churn the published page", () => {
    expect(buildAtlasTerrain({ zones, items })).toEqual(
      buildAtlasTerrain({ zones, items }),
    );
  });

  it("stays bounded for a large corpus", () => {
    const many = {
      zones: Array.from({ length: 30 }, (_, index) => ({
        x: (index % 6) / 6 + 0.08,
        y: Math.floor(index / 6) / 5 + 0.1,
        members: (index % 5) + 1,
      })),
      items: Array.from({ length: 200 }, (_, index) => ({
        x: ((index * 37) % 100) / 100,
        y: ((index * 61) % 100) / 100,
      })),
    };
    const size = buildAtlasTerrain(many).reduce(
      (total, contour) => total + contour.d.length,
      0,
    );
    expect(size).toBeLessThan(160_000);
  });

  it("insets unit coordinates so markers never touch the map's edge", () => {
    expect(atlasPosition(0)).toBeGreaterThan(0);
    expect(atlasPosition(1)).toBeLessThan(100);
    expect(atlasPosition(0.5)).toBe(50);
  });
});
