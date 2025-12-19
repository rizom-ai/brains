import { describe, it, expect, beforeEach } from "bun:test";
import { ProjectAdapter } from "../src/adapters/project-adapter";
import type { Project } from "../src/schemas/project";
import { computeContentHash } from "@brains/utils";

function createMockProject(overrides: Partial<Project> = {}): Project {
  const content =
    overrides.content ??
    `---
title: Test Project
status: draft
description: A test project description
year: 2024
---

## Context

Background info here.

## Problem

The challenge we faced.

## Solution

What we built.

## Outcome

The results.`;

  return {
    id: "test-project",
    entityType: "project",
    content,
    contentHash: computeContentHash(content),
    created: "2025-01-30T10:00:00.000Z",
    updated: "2025-01-30T10:00:00.000Z",
    metadata: {
      title: "Test Project",
      slug: "test-project",
      status: "draft",
      year: 2024,
    },
    ...overrides,
  };
}

describe("ProjectAdapter", () => {
  let adapter: ProjectAdapter;

  beforeEach(() => {
    adapter = new ProjectAdapter();
  });

  describe("schema", () => {
    it("should have correct entity type", () => {
      expect(adapter.entityType).toBe("project");
    });

    it("should have a valid zod schema", () => {
      expect(adapter.schema).toBeDefined();
    });
  });

  describe("fromMarkdown", () => {
    it("should parse frontmatter and extract metadata", () => {
      const markdown = `---
title: My Portfolio Project
status: published
description: A cool project I built
year: 2023
coverImage: /images/project.png
technologies:
  - TypeScript
  - React
url: https://example.com
---

## Context

Some context here.`;

      const result = adapter.fromMarkdown(markdown);

      expect(result.entityType).toBe("project");
      expect(result.metadata?.title).toBe("My Portfolio Project");
      expect(result.metadata?.status).toBe("published");
      expect(result.metadata?.year).toBe(2023);
    });

    it("should auto-generate slug from title", () => {
      const markdown = `---
title: My Amazing Project
status: draft
description: Description here
year: 2024
---

Content`;

      const result = adapter.fromMarkdown(markdown);

      expect(result.metadata?.slug).toBe("my-amazing-project");
    });

    it("should use provided slug if present", () => {
      const markdown = `---
title: My Project
slug: custom-slug
status: draft
description: Description
year: 2024
---

Content`;

      const result = adapter.fromMarkdown(markdown);

      expect(result.metadata?.slug).toBe("custom-slug");
    });
  });

  describe("toMarkdown", () => {
    it("should preserve frontmatter when present", () => {
      const content = `---
title: Test Project
status: draft
description: Test description
year: 2024
---

## Context

Content here`;

      const entity = createMockProject({ content });
      const markdown = adapter.toMarkdown(entity);

      expect(markdown).toContain("title: Test Project");
      expect(markdown).toContain("## Context");
    });

    it("should merge auto-generated slug into frontmatter", () => {
      const content = `---
title: New Project
status: draft
description: Description
year: 2024
---

Body`;

      const entity = createMockProject({
        content,
        metadata: {
          title: "New Project",
          slug: "new-project",
          status: "draft",
          year: 2024,
        },
      });
      const markdown = adapter.toMarkdown(entity);

      expect(markdown).toContain("slug: new-project");
    });
  });

  describe("extractMetadata", () => {
    it("should return entity metadata", () => {
      const entity = createMockProject({
        metadata: {
          title: "Extracted Title",
          slug: "extracted-slug",
          status: "published",
          year: 2023,
          publishedAt: "2023-06-15T00:00:00.000Z",
        },
      });

      const metadata = adapter.extractMetadata(entity);

      expect(metadata.title).toBe("Extracted Title");
      expect(metadata.slug).toBe("extracted-slug");
      expect(metadata.status).toBe("published");
      expect(metadata.year).toBe(2023);
    });
  });

  describe("parseProjectFrontmatter", () => {
    it("should parse frontmatter from entity", () => {
      const content = `---
title: Parsed Project
status: published
description: A parsed description
year: 2022
technologies:
  - Node.js
  - PostgreSQL
url: https://example.com/project
---

Body content`;

      const entity = createMockProject({ content });
      const frontmatter = adapter.parseProjectFrontmatter(entity);

      expect(frontmatter.title).toBe("Parsed Project");
      expect(frontmatter.status).toBe("published");
      expect(frontmatter.description).toBe("A parsed description");
      expect(frontmatter.year).toBe(2022);
      expect(frontmatter.technologies).toEqual(["Node.js", "PostgreSQL"]);
      expect(frontmatter.url).toBe("https://example.com/project");
    });
  });

  describe("parseStructuredContent", () => {
    it("should parse structured sections from body", () => {
      const content = `---
title: Test
status: draft
description: Desc
year: 2024
---

## Context

This is the context section with background info.

## Problem

This describes the problem we solved.

## Solution

This is how we solved it.

## Outcome

These are the results.`;

      const entity = createMockProject({ content });
      const structured = adapter.parseStructuredContent(entity);

      expect(structured.context).toContain("background info");
      expect(structured.problem).toContain("problem we solved");
      expect(structured.solution).toContain("how we solved it");
      expect(structured.outcome).toContain("the results");
    });

    it("should handle missing sections gracefully", () => {
      const content = `---
title: Test
status: draft
description: Desc
year: 2024
---

## Context

Just context, no other sections.`;

      const entity = createMockProject({ content });
      const structured = adapter.parseStructuredContent(entity);

      expect(structured.context).toContain("Just context");
      expect(structured.problem).toBe("");
      expect(structured.solution).toBe("");
      expect(structured.outcome).toBe("");
    });
  });

  describe("createProjectContent", () => {
    it("should create markdown with frontmatter and structured body", () => {
      const frontmatter = {
        title: "New Project",
        status: "draft" as const,
        description: "Project description",
        year: 2024,
        technologies: ["TypeScript"],
      };

      const body = {
        context: "The background",
        problem: "The challenge",
        solution: "The approach",
        outcome: "The results",
      };

      const markdown = adapter.createProjectContent(frontmatter, body);

      expect(markdown).toContain("title: New Project");
      expect(markdown).toContain("## Context");
      expect(markdown).toContain("The background");
      expect(markdown).toContain("## Problem");
      expect(markdown).toContain("The challenge");
      expect(markdown).toContain("## Solution");
      expect(markdown).toContain("The approach");
      expect(markdown).toContain("## Outcome");
      expect(markdown).toContain("The results");
    });
  });

  describe("roundtrip", () => {
    it("should preserve content through fromMarkdown -> toMarkdown", () => {
      const original = `---
title: Roundtrip Project
slug: roundtrip-project
status: published
description: A project for testing roundtrip
year: 2023
---

## Context

Context content.

## Problem

Problem content.

## Solution

Solution content.

## Outcome

Outcome content.`;

      const parsed = adapter.fromMarkdown(original);
      const entity = createMockProject({
        content: original,
        ...(parsed.metadata && { metadata: parsed.metadata }),
      });
      const output = adapter.toMarkdown(entity);

      expect(output).toContain("title: Roundtrip Project");
      expect(output).toContain("slug: roundtrip-project");
      expect(output).toContain("## Context");
      expect(output).toContain("## Outcome");
    });
  });
});
