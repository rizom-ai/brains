import { describe, expect, test } from "bun:test";
import { SightingAdapter } from "../src/adapters/sighting-adapter";
import { SIGHTING_ENTITY_TYPE } from "../src/lib/constants";
import type { SightingEntity } from "../src/schemas/sighting";

const adapter = new SightingAdapter();

const frontmatter = {
  name: "Vale",
  url: "https://vale.example",
  kind: "professional" as const,
  tags: ["research", "methods"],
  introducedBy: ["kai.brain"],
  hops: 2,
  sightedAt: "2026-07-13T00:00:00.000Z",
};

describe("SightingAdapter", () => {
  test("round-trips a sighting through markdown", () => {
    const markdown = adapter.createSightingContent(
      frontmatter,
      "Methodical research partner sighted via Kai.",
    );

    const partial = adapter.fromMarkdown(markdown);
    expect(partial.entityType).toBe(SIGHTING_ENTITY_TYPE);
    expect(partial.metadata).toEqual({
      name: "Vale",
      url: "https://vale.example",
      introducedBy: ["kai.brain"],
      hops: 2,
    });

    const parsed = adapter.parseSighting({
      content: markdown,
    } as SightingEntity);
    expect(parsed.frontmatter).toEqual(frontmatter);
    expect(parsed.about).toBe("Methodical research partner sighted via Kai.");
  });

  test("rejects sightings without provenance", () => {
    const markdown = adapter.createSightingContent(
      { ...frontmatter, introducedBy: [] },
      "",
    );

    expect(() => adapter.fromMarkdown(markdown)).toThrow();
  });
});
