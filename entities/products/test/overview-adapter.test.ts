import { describe, it, expect, beforeEach } from "bun:test";
import { OverviewAdapter } from "../src/adapters/overview-adapter";
import type { Overview } from "../src/schemas/overview";
import { createTestEntity } from "@brains/test-utils";

const sampleFrontmatter = `---
headline: What We Build
tagline: Brain models for every use case
---`;

const sampleBody = `# Products Overview

## Vision

We believe knowledge work deserves better tools.

## Pillars

### Pillar 1

#### Title

AI-Native

#### Description

Built from the ground up with AI at the core

### Pillar 2

#### Title

Plugin-Based

#### Description

Extensible architecture that adapts to your workflow

## Technologies

- TypeScript
- Preact
- Drizzle ORM

## Benefits

### Benefit 1

#### Title

Own Your Data

#### Description

All content stored as markdown — portable, readable, yours

### Benefit 2

#### Title

Extend Everything

#### Description

Plugin system makes every brain customizable

## CTA

### Text

Get Started

### Link

/docs/getting-started`;

const sampleMarkdown = `${sampleFrontmatter}

${sampleBody}`;

function createMockOverview(overrides: Partial<Overview> = {}): Overview {
  return createTestEntity<Overview>("products-overview", {
    content: overrides.content ?? sampleMarkdown,
    metadata: {
      headline: "What We Build",
      slug: "overview",
      ...overrides.metadata,
    },
    ...overrides,
  });
}

describe("OverviewAdapter", () => {
  let adapter: OverviewAdapter;

  beforeEach(() => {
    adapter = new OverviewAdapter();
  });

  it("should have correct entity type", () => {
    expect(adapter.entityType).toBe("products-overview");
  });

  describe("fromMarkdown", () => {
    it("should extract metadata from frontmatter", () => {
      const result = adapter.fromMarkdown(sampleMarkdown);

      expect(result.entityType).toBe("products-overview");
      expect(result.metadata?.headline).toBe("What We Build");
      expect(result.metadata?.slug).toBe("what-we-build");
    });

    it("should store full markdown as content", () => {
      const result = adapter.fromMarkdown(sampleMarkdown);

      expect(result.content).toBe(sampleMarkdown);
    });
  });

  describe("toMarkdown", () => {
    it("should preserve frontmatter through roundtrip", () => {
      const entity = createMockOverview();
      const markdown = adapter.toMarkdown(entity);

      expect(markdown).toContain("headline: What We Build");
      expect(markdown).toContain("tagline: Brain models for every use case");
    });

    it("should preserve body content through roundtrip", () => {
      const entity = createMockOverview();
      const markdown = adapter.toMarkdown(entity);

      expect(markdown).toContain("Vision");
      expect(markdown).toContain("knowledge work");
      expect(markdown).toContain("AI-Native");
      expect(markdown).toContain("TypeScript");
      expect(markdown).toContain("Own Your Data");
      expect(markdown).toContain("Get Started");
    });
  });

  describe("extractMetadata", () => {
    it("should return entity metadata", () => {
      const entity = createMockOverview();
      const metadata = adapter.extractMetadata(entity);

      expect(metadata.headline).toBe("What We Build");
      expect(metadata.slug).toBe("overview");
    });
  });
});
