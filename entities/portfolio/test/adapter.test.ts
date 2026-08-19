import { describe, it, expect, beforeEach } from "bun:test";
import { ProjectAdapter } from "../src/adapters/project-adapter";
import type { Project } from "../src/schemas/project";
import { createTestEntity } from "@brains/test-utils";

const DEFAULT_PROJECT_CONTENT = `---
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

function createMockProject(overrides: Partial<Project> = {}): Project {
  return createTestEntity<Project>("project", {
    content: DEFAULT_PROJECT_CONTENT,
    metadata: {
      title: "Test Project",
      slug: "test-project",
      status: "draft",
      year: 2024,
    },
    ...overrides,
  });
}

// What is left of ProjectAdapter after the conversion: the structured-body
// half the markdown codec does not own. Its frontmatter round-trips are
// asserted against the runtime adapter in plugin.test.ts.
describe("ProjectAdapter", () => {
  let adapter: ProjectAdapter;

  beforeEach(() => {
    adapter = new ProjectAdapter();
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

    it("should throw when sections are missing", () => {
      const content = `---
title: Test
status: draft
description: Desc
year: 2024
---

## Context

Just context, no other sections.`;

      const entity = createMockProject({ content });

      expect(() => adapter.parseStructuredContent(entity)).toThrow();
    });
  });

  describe("createProjectContent", () => {
    it("should create markdown with frontmatter and structured body", () => {
      const frontmatter = {
        title: "New Project",
        status: "draft" as const,
        description: "Project description",
        year: 2024,
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
});
