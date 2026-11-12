import { describe, expect, test } from "bun:test";
import type { DocWithData } from "../src/schemas/doc";
import { sortDocs } from "../src/templates/docs-design";

const createDoc = (id: string, title: string, order: number): DocWithData => ({
  id,
  entityType: "doc",
  content: `# ${title}`,
  created: "2026-01-01T00:00:00.000Z",
  updated: "2026-01-01T00:00:00.000Z",
  visibility: "public",
  metadata: {
    title,
    section: "Start here",
    order,
    description: null,
    slug: id,
  },
  contentHash: `hash-${id}`,
  frontmatter: {
    title,
    section: "Start here",
    order,
    description: null,
    slug: id,
  },
  body: `# ${title}`,
});

describe("sortDocs", () => {
  test("lists docs by order, then title, then id", () => {
    const sorted = sortDocs([
      createDoc("setup-b", "Setup", 1),
      createDoc("intro", "Intro", 2),
      createDoc("setup-a", "Setup", 1),
      createDoc("about", "About", 1),
    ]);
    expect(sorted.map((doc) => doc.id)).toEqual([
      "about",
      "setup-a",
      "setup-b",
      "intro",
    ]);
  });
});
