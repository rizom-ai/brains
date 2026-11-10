import { createTestEntity } from "@brains/entity-service/test";
import { describe, it, expect, beforeAll } from "bun:test";
import type { BaseEntity, EntityAdapter } from "@brains/plugins";
import { createPluginHarness } from "@brains/plugins/test";
import { projectBody, projectSections } from "../src/lib/project-markdown";
import {
  projectMetadataSchema,
  type Project,
  type ProjectMetadata,
} from "../src/schemas/project";
import { portfolioPlugin } from "./portfolio-plugin";

const SECTIONS = `## Context

Background info here.

## Problem

The challenge we faced.

## Solution

What we built.

## Outcome

The results.`;

const METADATA: ProjectMetadata = {
  title: "Test Project",
  slug: "test-project",
  status: "draft",
  description: "A test project description",
  year: 2024,
};

function createMockProject(overrides: Partial<Project> = {}): Project {
  return createTestEntity<Project>("project", {
    content: SECTIONS,
    metadata: METADATA,
    ...overrides,
  });
}

/** The project's adapter, as the declared project registers it. */
describe("the project adapter", () => {
  let adapter: EntityAdapter<BaseEntity>;

  beforeAll(async () => {
    const harness = createPluginHarness();
    await harness.installPlugin(portfolioPlugin());
    adapter = harness.getEntityRegistry().getAdapter("project");
  });

  describe("schema", () => {
    it("should have correct entity type", () => {
      expect(adapter.entityType).toBe("project");
      expect(adapter.purpose).toContain("case study");
    });
  });

  describe("fromMarkdown", () => {
    it("reads the frontmatter as metadata and the sections as the body", () => {
      const markdown = `---
title: My Portfolio Project
status: published
description: A cool project I built
year: 2023
coverImageId: hero-image
url: https://example.com
---

## Context

Some context here.`;

      const result = adapter.fromMarkdown(markdown);

      expect(result.metadata).toMatchObject({
        title: "My Portfolio Project",
        status: "published",
        description: "A cool project I built",
        year: 2023,
        coverImageId: "hero-image",
        url: "https://example.com",
      });
      expect(result.content).toBe("## Context\n\nSome context here.");
    });

    it("resolves the slug from the title when the file states none", () => {
      const result = adapter.fromMarkdown(
        "---\ntitle: My Amazing Project\nstatus: draft\ndescription: D\nyear: 2024\n---\n\nContent",
      );
      expect(result.metadata?.["slug"]).toBe("my-amazing-project");
      expect(result.metadata?.["authoredSlug"]).toBeUndefined();
    });

    it("keeps a stated slug", () => {
      const result = adapter.fromMarkdown(
        "---\ntitle: My Project\nslug: custom-slug\nstatus: draft\ndescription: D\nyear: 2024\n---\n\nContent",
      );
      expect(result.metadata?.["slug"]).toBe("custom-slug");
      expect(result.metadata?.["authoredSlug"]).toBe(true);
    });

    it("keeps the error a failed generation recorded", () => {
      const result = adapter.fromMarkdown(
        "---\ntitle: P\nslug: p\nstatus: failed\ndescription: ''\nyear: 2024\nerror: The model refused\n---\n",
      );
      expect(result.metadata?.["error"]).toBe("The model refused");
    });
  });

  describe("toMarkdown", () => {
    it("writes a resolved slug after the other fields, as the adapter merged it", () => {
      expect(adapter.toMarkdown(createMockProject())).toBe(
        `---\ntitle: Test Project\nstatus: draft\ndescription: A test project description\nyear: 2024\nslug: test-project\n---\n${SECTIONS}\n`,
      );
    });

    it("writes a stated slug where the file states it", () => {
      expect(
        adapter.toMarkdown(
          createMockProject({ metadata: { ...METADATA, authoredSlug: true } }),
        ),
      ).toBe(
        `---\ntitle: Test Project\nslug: test-project\nstatus: draft\ndescription: A test project description\nyear: 2024\n---\n${SECTIONS}\n`,
      );
    });
  });

  describe("roundtrip", () => {
    it("writes a stated document back as it was", () => {
      const original = `---
title: Roundtrip Project
slug: roundtrip-project
status: published
description: A project for testing roundtrip
year: 2023
---
${SECTIONS}
`;
      const parsed = adapter.fromMarkdown(original);
      const output = adapter.toMarkdown(
        createMockProject({
          content: parsed.content ?? "",
          metadata: projectMetadataSchema.parse(parsed.metadata),
        }),
      );
      expect(output).toBe(original);
    });
  });
});

describe("a project's sections", () => {
  it("reads the four sections from the body", () => {
    const structured = projectSections(SECTIONS);
    expect(structured.context).toContain("Background info");
    expect(structured.problem).toContain("challenge we faced");
    expect(structured.solution).toContain("What we built");
    expect(structured.outcome).toContain("The results");
  });

  it("refuses a body missing sections", () => {
    expect(() =>
      projectSections("## Context\n\nJust context, no other sections."),
    ).toThrow();
  });

  it("writes the four sections as the body", () => {
    const markdown = projectBody({
      context: "The background",
      problem: "The challenge",
      solution: "The approach",
      outcome: "The results",
    });
    for (const text of [
      "## Context",
      "The background",
      "## Problem",
      "The challenge",
      "## Solution",
      "The approach",
      "## Outcome",
      "The results",
    ]) {
      expect(markdown).toContain(text);
    }
  });
});
