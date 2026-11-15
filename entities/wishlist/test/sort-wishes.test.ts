import { describe, expect, it } from "bun:test";
import { sortWishesByDemand } from "../src/lib/sort-wishes";

const wish = (
  id: string,
  requested: number,
  priority: "critical" | "high" | "medium" | "low",
): {
  id: string;
  metadata: { requested: number; priority: typeof priority };
} => ({
  id,
  metadata: { requested, priority },
});

describe("sortWishesByDemand", () => {
  it("lists wishes by requests, then priority, keeping the given order for ties", () => {
    const sorted = sortWishesByDemand([
      wish("wish-c", 2, "medium"),
      wish("wish-a", 2, "medium"),
      wish("wish-d", 5, "low"),
      wish("wish-b", 2, "high"),
    ]);
    expect(sorted.map((entry) => entry.id)).toEqual([
      "wish-d",
      "wish-b",
      "wish-c",
      "wish-a",
    ]);
  });
});
