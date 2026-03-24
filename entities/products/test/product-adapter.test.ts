import { describe, it, expect, beforeEach } from "bun:test";
import { ProductAdapter } from "../src/adapters/product-adapter";
import type { Product } from "../src/schemas/product";
import { createTestEntity } from "@brains/test-utils";

const sampleMarkdown = `---
name: Rover
availability: early access
order: 1
---

## Tagline

Your AI-powered personal knowledge hub

## Role

Personal knowledge manager and professional content curator

## Purpose

Organize thoughts, capture knowledge, and showcase professional work

## Audience

Creators, writers, and independent professionals

## Values

- clarity
- organization
- professionalism

## Capabilities

### Feature 1

#### Title

AI Blogging

#### Description

Generate blog posts from your knowledge base

### Feature 2

#### Title

Social Publishing

#### Description

Share content across LinkedIn and other platforms

## Story

Rover is the professional brain — a personal knowledge operating system.`;

function createMockProduct(overrides: Partial<Product> = {}): Product {
  return createTestEntity<Product>("product", {
    content: overrides.content ?? sampleMarkdown,
    metadata: {
      name: "Rover",
      slug: "rover",
      availability: "early access",
      order: 1,
      ...overrides.metadata,
    },
    ...overrides,
  });
}

describe("ProductAdapter", () => {
  let adapter: ProductAdapter;

  beforeEach(() => {
    adapter = new ProductAdapter();
  });

  it("should have correct entity type", () => {
    expect(adapter.entityType).toBe("product");
  });

  describe("fromMarkdown", () => {
    it("should extract metadata from frontmatter", () => {
      const result = adapter.fromMarkdown(sampleMarkdown);

      expect(result.entityType).toBe("product");
      expect(result.metadata?.name).toBe("Rover");
      expect(result.metadata?.slug).toBe("rover");
      expect(result.metadata?.availability).toBe("early access");
      expect(result.metadata?.order).toBe(1);
    });

    it("should auto-generate slug from name", () => {
      const markdown = sampleMarkdown.replace(
        "name: Rover",
        "name: My Cool Brain",
      );
      const result = adapter.fromMarkdown(markdown);

      expect(result.metadata?.slug).toBe("my-cool-brain");
    });

    it("should store full markdown as content", () => {
      const result = adapter.fromMarkdown(sampleMarkdown);

      expect(result.content).toBe(sampleMarkdown);
    });
  });

  describe("toMarkdown", () => {
    it("should preserve frontmatter fields through roundtrip", () => {
      const entity = createMockProduct();
      const markdown = adapter.toMarkdown(entity);

      expect(markdown).toContain("name: Rover");
      expect(markdown).toContain("availability: early access");
      expect(markdown).toContain("order: 1");
    });

    it("should preserve structured body content", () => {
      const entity = createMockProduct();
      const markdown = adapter.toMarkdown(entity);

      expect(markdown).toContain("## Tagline");
      expect(markdown).toContain("AI-powered personal knowledge hub");
      expect(markdown).toContain("## Role");
      expect(markdown).toContain("Personal knowledge manager");
      expect(markdown).toContain("## Capabilities");
      expect(markdown).toContain("AI Blogging");
      expect(markdown).toContain("## Story");
      expect(markdown).toContain("personal knowledge operating system");
    });

    it("should not include descriptive fields in frontmatter", () => {
      const entity = createMockProduct();
      const markdown = adapter.toMarkdown(entity);

      // Frontmatter section is between the first --- and second ---
      const frontmatterMatch = markdown.match(/^---\n([\s\S]*?)\n---/);
      const frontmatter = frontmatterMatch?.[1] ?? "";

      expect(frontmatter).not.toContain("tagline:");
      expect(frontmatter).not.toContain("role:");
      expect(frontmatter).not.toContain("purpose:");
      expect(frontmatter).not.toContain("audience:");
      expect(frontmatter).not.toContain("values:");
      expect(frontmatter).not.toContain("features:");
    });
  });

  describe("extractMetadata", () => {
    it("should return entity metadata", () => {
      const entity = createMockProduct();
      const metadata = adapter.extractMetadata(entity);

      expect(metadata.name).toBe("Rover");
      expect(metadata.slug).toBe("rover");
      expect(metadata.availability).toBe("early access");
      expect(metadata.order).toBe(1);
    });
  });
});
