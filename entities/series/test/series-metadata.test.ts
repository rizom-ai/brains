import { describe, expect, it } from "bun:test";
import { compareBySeriesIndex } from "../src/lib/series-metadata";

const member = (
  id: string,
  entityType: string,
  seriesIndex?: number,
): { id: string; entityType: string; metadata: unknown } => ({
  id,
  entityType,
  metadata: {
    seriesName: "S",
    ...(seriesIndex !== undefined && { seriesIndex }),
  },
});

describe("compareBySeriesIndex", () => {
  it("lists members by index, unindexed last, ties by id then type", () => {
    const sorted = [
      member("b", "post"),
      member("c", "post", 1),
      member("a", "post"),
      member("a", "deck", 2),
      member("a", "post", 2),
      member("a", "deck"),
    ].sort(compareBySeriesIndex);
    expect(sorted.map((entry) => `${entry.entityType}:${entry.id}`)).toEqual([
      "post:c",
      "deck:a",
      "post:a",
      "deck:a",
      "post:a",
      "post:b",
    ]);
  });
});
