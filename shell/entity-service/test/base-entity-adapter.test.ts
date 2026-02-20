import { describe, it, expect } from "bun:test";
import { z } from "@brains/utils";
import { createTestEntity } from "@brains/test-utils";
import { BaseEntityAdapter } from "../src/adapters/base-entity-adapter";
import type { BaseEntity } from "../src/types";

// ── Test schema setup ──

const testFrontmatterSchema = z.object({
  title: z.string(),
  status: z.enum(["draft", "published"]).default("draft"),
});
type TestFrontmatter = z.infer<typeof testFrontmatterSchema>;

const testMetadataSchema = testFrontmatterSchema.pick({ title: true });
type TestMetadata = z.infer<typeof testMetadataSchema>;

interface TestEntity extends BaseEntity<TestMetadata> {
  entityType: "test";
  metadata: TestMetadata;
}

const testEntitySchema = z.object({
  id: z.string(),
  entityType: z.literal("test"),
  content: z.string(),
  contentHash: z.string(),
  created: z.string().datetime(),
  updated: z.string().datetime(),
  metadata: testMetadataSchema,
}) as z.ZodSchema<TestEntity>;

// ── Concrete subclass that exposes protected helpers for testing ──

class TestAdapter extends BaseEntityAdapter<
  TestEntity,
  TestMetadata,
  TestFrontmatter
> {
  constructor() {
    super({
      entityType: "test",
      schema: testEntitySchema,
      frontmatterSchema: testFrontmatterSchema,
    });
  }

  public toMarkdown(entity: TestEntity): string {
    const body = this.extractBody(entity.content);
    return this.buildMarkdown(body, entity.metadata as Record<string, unknown>);
  }

  public fromMarkdown(markdown: string): Partial<TestEntity> {
    const frontmatter = this.parseFrontmatter(markdown);
    return {
      entityType: "test",
      content: markdown,
      metadata: { title: frontmatter.title },
    };
  }

  // Expose protected helpers for direct testing
  public testExtractBody(markdown: string): string {
    return this.extractBody(markdown);
  }

  public testParseFrontmatter(markdown: string): TestFrontmatter {
    return this.parseFrontmatter(markdown);
  }

  public testBuildMarkdown(
    body: string,
    frontmatter: Record<string, unknown>,
  ): string {
    return this.buildMarkdown(body, frontmatter);
  }
}

// ── Fixtures ──

const markdownWithFrontmatter = `---
title: Hello World
status: published
---
Body content here`;

const markdownWithoutFrontmatter = "Just plain content";

function createTestEntityFixture(
  overrides: Partial<TestEntity> = {},
): TestEntity {
  return createTestEntity<TestEntity>("test", {
    metadata: { title: "Test Title" },
    content: markdownWithFrontmatter,
    ...overrides,
  });
}

// ── Tests ──

describe("BaseEntityAdapter", () => {
  const adapter = new TestAdapter();

  describe("constructor", () => {
    it("should set entityType from config", () => {
      expect(adapter.entityType).toBe("test");
    });

    it("should set schema from config", () => {
      expect(adapter.schema).toBe(testEntitySchema);
    });

    it("should set frontmatterSchema from config", () => {
      expect(adapter.frontmatterSchema).toBe(testFrontmatterSchema);
    });

    it("should set optional CMS hints", () => {
      const withHints = new (class extends BaseEntityAdapter<
        TestEntity,
        TestMetadata,
        TestFrontmatter
      > {
        constructor() {
          super({
            entityType: "test",
            schema: testEntitySchema,
            frontmatterSchema: testFrontmatterSchema,
            isSingleton: true,
            hasBody: false,
            supportsCoverImage: true,
          });
        }
        toMarkdown(): string {
          return "";
        }
        fromMarkdown(): Partial<TestEntity> {
          return {};
        }
      })();

      expect(withHints.isSingleton).toBe(true);
      expect(withHints.hasBody).toBe(false);
      expect(withHints.supportsCoverImage).toBe(true);
    });
  });

  describe("extractMetadata (default)", () => {
    it("should return entity.metadata", () => {
      const entity = createTestEntityFixture();
      expect(adapter.extractMetadata(entity)).toEqual({ title: "Test Title" });
    });
  });

  describe("parseFrontMatter (default)", () => {
    it("should parse frontmatter with the given schema", () => {
      const result = adapter.parseFrontMatter(
        markdownWithFrontmatter,
        testFrontmatterSchema,
      );
      expect(result).toEqual({ title: "Hello World", status: "published" });
    });
  });

  describe("generateFrontMatter (default)", () => {
    it("should generate frontmatter from entity metadata", () => {
      const entity = createTestEntityFixture();
      const result = adapter.generateFrontMatter(entity);
      expect(result).toContain("title: Test Title");
      expect(result).toMatch(/^---\n/);
      expect(result).toMatch(/\n---$/);
    });
  });

  describe("extractBody (helper)", () => {
    it("should strip frontmatter and return body", () => {
      const body = adapter.testExtractBody(markdownWithFrontmatter);
      expect(body).toBe("Body content here");
    });

    it("should return content as-is when no frontmatter", () => {
      const body = adapter.testExtractBody(markdownWithoutFrontmatter);
      expect(body).toBe("Just plain content");
    });
  });

  describe("parseFrontmatter (helper)", () => {
    it("should parse using adapter's frontmatter schema", () => {
      const result = adapter.testParseFrontmatter(markdownWithFrontmatter);
      expect(result).toEqual({ title: "Hello World", status: "published" });
    });
  });

  describe("buildMarkdown (helper)", () => {
    it("should combine body and frontmatter into markdown", () => {
      const result = adapter.testBuildMarkdown("Some body", {
        title: "My Title",
      });
      expect(result).toContain("title: My Title");
      expect(result).toContain("Some body");
    });
  });

  describe("toMarkdown / fromMarkdown (concrete)", () => {
    it("should round-trip through toMarkdown and fromMarkdown", () => {
      const entity = createTestEntityFixture({
        content: markdownWithFrontmatter,
        metadata: { title: "Hello World" },
      });

      const markdown = adapter.toMarkdown(entity);
      expect(markdown).toContain("title: Hello World");
      expect(markdown).toContain("Body content here");

      const parsed = adapter.fromMarkdown(markdown);
      expect(parsed.entityType).toBe("test");
      expect(parsed.metadata?.title).toBe("Hello World");
    });
  });
});
