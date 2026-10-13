import { describe, expect, it } from "bun:test";
import {
  operatorSeriesBlockSchema,
  type OperatorSeriesBlock,
} from "../src/operator/operator-view-contract";
import {
  safeParseRuntimeDashboardOperatorView,
  safeParseRuntimeStudioOperatorView,
} from "../src/operator/operator-view-runtime";

const block: OperatorSeriesBlock = {
  type: "series",
  id: "daily",
  label: "Pageviews per day",
  unit: "pageviews",
  points: [
    { id: "2026-10-08", label: "8 Oct", value: 4 },
    {
      id: "2026-10-09",
      label: "9 Oct",
      value: 55,
      marker: "Published: Infrastructure, Not Platforms",
    },
    { id: "2026-10-10", label: "10 Oct", value: null },
    { id: "2026-10-11", label: "11 Oct", value: 12, tone: "warn" },
  ],
};

describe("the series block", () => {
  it("accepts a series with a missing point, a marker and a tone", () => {
    expect(operatorSeriesBlockSchema.parse(block)).toEqual(block);
  });

  it("refuses negative values and an empty series", () => {
    expect(
      operatorSeriesBlockSchema.safeParse({
        ...block,
        points: [{ id: "a", label: "A", value: -1 }],
      }).success,
    ).toBe(false);
    expect(
      operatorSeriesBlockSchema.safeParse({ ...block, points: [] }).success,
    ).toBe(false);
  });

  it("holds a year of days, and no more", () => {
    const days = (count: number): OperatorSeriesBlock["points"] =>
      Array.from({ length: count }, (_, i) => ({
        id: `d${i}`,
        label: `D${i}`,
        value: i,
      }));
    expect(
      operatorSeriesBlockSchema.safeParse({ ...block, points: days(370) })
        .success,
    ).toBe(true);
    expect(
      operatorSeriesBlockSchema.safeParse({ ...block, points: days(371) })
        .success,
    ).toBe(false);
  });

  it("is a block Studio views and dashboard views both carry", () => {
    expect(
      safeParseRuntimeStudioOperatorView(
        { blocks: [block] },
        { actions: [], permission: "admin" },
      ).success,
    ).toBe(true);
    expect(
      safeParseRuntimeDashboardOperatorView({ blocks: [block] }).success,
    ).toBe(true);
  });
});
