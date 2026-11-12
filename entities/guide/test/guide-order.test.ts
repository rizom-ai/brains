import { describe, expect, it } from "bun:test";
import { sortGuides } from "../src";
import type { GuideWithData } from "../src/schemas/guide";
import { guideWithData } from "./fixtures";

function titled(slug: string, order: number, title: string): GuideWithData {
  const guide = guideWithData(slug, order);
  return {
    ...guide,
    metadata: { ...guide.metadata, title },
    frontmatter: { ...guide.frontmatter, title },
  };
}

describe("sortGuides", () => {
  it("lists guides by order, then title, keeping the given order for ties", () => {
    const sorted = sortGuides([
      titled("writer-b", 1, "Writer"),
      titled("team", 2, "Team"),
      titled("writer-a", 1, "Writer"),
      titled("artist", 1, "Artist"),
    ]);
    expect(sorted.map((guide) => guide.id)).toEqual([
      "artist",
      "writer-b",
      "writer-a",
      "team",
    ]);
  });
});
