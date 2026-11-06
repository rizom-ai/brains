import { describe, expect, it } from "bun:test";
import {
  publicationFacts,
  renderDetailFacts,
} from "../../src/lib/site-workspace-facts";

const publication = {
  state: "published" as const,
  buildId: "2fea3b8d-6a0b-4997-938e-8b34f04d2504",
  publishedAt: "2026-10-20T07:00:00.000Z",
  routesBuilt: 36,
  warnings: [],
};

describe("site publication facts", () => {
  it("state when it was published and how many pages, not the build id", () => {
    const facts = publicationFacts(publication);
    expect(facts).toEqual([
      { label: "Published at", value: "2026-10-20T07:00:00.000Z" },
      { label: "Pages", value: "36" },
    ]);
    expect(JSON.stringify(facts)).not.toContain("2fea3b8d");
  });

  it("add nothing when the card already says nothing is published", () => {
    expect(publicationFacts({ state: "not-published" })).toEqual([]);
  });

  it("keep the build id with the render details", () => {
    expect(
      renderDetailFacts({ environment: "preview", publication }),
    ).toContainEqual({
      label: "Published build",
      value: "2fea3b8d-6a0b-4997-938e-8b34f04d2504",
    });
  });
});
