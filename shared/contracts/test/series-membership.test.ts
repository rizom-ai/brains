import { describe, expect, it } from "bun:test";
import {
  compareBySeriesPosition,
  getSeriesName,
} from "../src/series-membership";

const member = (
  id: string,
  created: string,
  publishedAt?: string,
): {
  id: string;
  created: string;
  metadata: unknown;
} => ({
  id,
  created,
  metadata: {
    series: ["S"],
    ...(publishedAt !== undefined && { publishedAt }),
  },
});

describe("a series member", () => {
  it("names its series by the one group value it holds", () => {
    expect(getSeriesName({ metadata: { series: ["Cities"] } })).toBe("Cities");
    expect(getSeriesName({ metadata: { series: [" "] } })).toBeUndefined();
    expect(getSeriesName({ metadata: { series: [] } })).toBeUndefined();
    expect(getSeriesName({ metadata: {} })).toBeUndefined();
  });

  it("takes its place by when it was published, drafts after by when they were made", () => {
    const sorted = [
      member("draft-late", "2026-03-01T00:00:00Z"),
      member("second", "2026-01-01T00:00:00Z", "2026-02-10T00:00:00Z"),
      member("draft-early", "2026-02-20T00:00:00Z"),
      member("first", "2026-01-05T00:00:00Z", "2026-02-01T00:00:00Z"),
    ].sort(compareBySeriesPosition);
    expect(sorted.map((entry) => entry.id)).toEqual([
      "first",
      "second",
      "draft-early",
      "draft-late",
    ]);
  });
});
