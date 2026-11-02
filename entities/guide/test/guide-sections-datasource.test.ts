import { beforeEach, describe, expect, it } from "bun:test";
import { createMockShell, type MockShell } from "@brains/plugins/test";
import type { BaseDataSourceContext, BaseEntity } from "@brains/plugins";
import {
  GuideSectionsDataSource,
  guideSectionsSchema,
  type GuideSectionsData,
} from "../src";
import { guideMarkdown } from "./fixtures";

function doc(slug: string, section: string, order: number): BaseEntity {
  return {
    id: slug,
    entityType: "doc",
    content: `---
title: Doc ${slug}
section: ${section}
order: ${order}
slug: ${slug}
---

# Doc ${slug}
`,
    contentHash: `hash-${slug}`,
    created: "2026-11-02T00:00:00.000Z",
    updated: "2026-11-02T00:00:00.000Z",
    visibility: "public",
    metadata: { title: `Doc ${slug}`, section, order, slug },
  };
}

function guide(slug: string, order: number, section?: string): BaseEntity {
  return {
    id: slug,
    entityType: "guide",
    content: guideMarkdown(slug, order, section ? `\nsection: ${section}` : ""),
    contentHash: `hash-${slug}`,
    created: "2026-11-02T00:00:00.000Z",
    updated: "2026-11-02T00:00:00.000Z",
    visibility: "public",
    metadata: {
      title: `Moving in as ${slug}`,
      slug,
      order,
      persona: `The ${slug}`,
      for: `You are a ${slug}.`,
      recipe: null,
      section: section ?? null,
      material: [],
    },
  };
}

describe("GuideSectionsDataSource", () => {
  let shell: MockShell;
  let context: BaseDataSourceContext;
  let datasource: GuideSectionsDataSource;

  const fetchSections = (): Promise<GuideSectionsData> =>
    datasource.fetch({}, guideSectionsSchema, context);

  beforeEach(() => {
    shell = createMockShell();
    context = { entityService: shell.getEntityService() };
    datasource = new GuideSectionsDataSource();
    shell.addEntities([
      doc("index", "Use a brain", 0),
      doc("getting-started", "Run a brain", 100),
      doc("content-management", "Use a brain", 20),
      doc("feature-overview", "Use a brain", 10),
      doc("theming-guide", "Extend a brain", 200),
      guide("researcher", 20, "Use a brain"),
      guide("self-hosting", 50, "Run a brain"),
      guide("writer", 10, "Use a brain"),
      guide("unsorted", 30),
      guide("elsewhere", 40, "Not a docs section"),
    ]);
  });

  it("is the guides-with-docs data source", () => {
    expect(datasource.id).toBe("guides:sections");
  });

  it("groups the docs by section, in the order of their docs", async () => {
    const { sections } = await fetchSections();

    expect(sections.map((section) => section.name)).toEqual([
      "Use a brain",
      "Run a brain",
      "Extend a brain",
    ]);
    expect(sections[0]?.docs.map((item) => item.slug)).toEqual([
      "feature-overview",
      "content-management",
    ]);
  });

  it("leaves out the docs landing page, which the sections introduce", async () => {
    const { sections } = await fetchSections();

    const slugs = sections.flatMap((section) =>
      section.docs.map((item) => item.slug),
    );
    expect(slugs).not.toContain("index");
  });

  it("lists each section's guides beside its docs, in guide order", async () => {
    const { sections } = await fetchSections();

    expect(
      sections.map((section) =>
        section.guides.map((item) => item.metadata.slug),
      ),
    ).toEqual([["writer", "researcher"], ["self-hosting"], []]);
  });

  it("leaves out guides that name no docs section or one without docs", async () => {
    const { sections } = await fetchSections();

    const slugs = sections.flatMap((section) =>
      section.guides.map((item) => item.metadata.slug),
    );
    expect(slugs).not.toContain("unsorted");
    expect(slugs).not.toContain("elsewhere");
  });
});
