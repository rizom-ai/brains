import { describe, it, expect, beforeEach } from "bun:test";
import { LinkAdapter } from "../src/adapters/link-adapter";
import {
  createMockLinkEntity,
  mockLinkContent,
} from "./fixtures/link-entities";
describe("LinkAdapter", () => {
  let adapter: LinkAdapter;

  beforeEach(() => {
    adapter = new LinkAdapter();
  });

  it("should have correct entity type and schema", () => {
    expect(adapter.entityType).toBe("link");
    expect(adapter.schema).toBeDefined();
  });

  it("should create link content with frontmatter", () => {
    const linkContent = adapter.createLinkContent({
      status: "draft",
      title: "Test Article",
      url: "https://example.com/test",
      description: "A test article",
      summary: "This is a test article summary.",
      domain: "example.com",
      capturedAt: "2025-01-30T10:00:00.000Z",
      source: {
        ref: "cli:local",
        label: "CLI",
      },
    });

    // Check frontmatter (using regex to allow YAML quoting variations)
    expect(linkContent).toContain("---");
    expect(linkContent).toContain("status: draft");
    expect(linkContent).toContain("title: Test Article");
    expect(linkContent).toMatch(/url: ['"]?https:\/\/example\.com\/test['"]?/);
    expect(linkContent).toContain("description: A test article");
    expect(linkContent).toContain("domain: example.com");
    expect(linkContent).toMatch(/ref: ['"]?cli:local['"]?/);
    expect(linkContent).toContain("label: CLI");
    // Check body (summary)
    expect(linkContent).toContain("This is a test article summary.");
  });

  it("should parse link content correctly", () => {
    const sampleContent = `---
status: draft
title: Test Article
url: https://example.com/test
description: A test article
domain: example.com
capturedAt: "2025-01-30T10:00:00.000Z"
source:
  ref: "cli:local"
  label: CLI
---

This is a test article summary.`;

    const parsed = adapter.parseLinkContent(sampleContent);

    expect(parsed.frontmatter.title).toBe("Test Article");
    expect(parsed.frontmatter.url).toBe("https://example.com/test");
    expect(parsed.frontmatter.status).toBe("draft");
    expect(parsed.frontmatter.description).toBe("A test article");
    expect(parsed.frontmatter.domain).toBe("example.com");
    expect(parsed.frontmatter.capturedAt).toBe("2025-01-30T10:00:00.000Z");
    expect(parsed.frontmatter.source).toEqual({
      ref: "cli:local",
      label: "CLI",
    });
    expect(parsed.summary).toBe("This is a test article summary.");
  });

  it("should convert entity to markdown", () => {
    const entity = createMockLinkEntity({
      id: "test-id",
      content: mockLinkContent.simple,
      metadata: { status: "draft", title: "Test Article" },
    });

    const markdown = adapter.toMarkdown(entity);
    expect(markdown).toContain("---");
    expect(markdown).toContain("status: draft");
    expect(markdown).toContain("Test summary");
  });

  it("should convert markdown to entity with metadata from frontmatter", () => {
    const markdown = mockLinkContent.simple;
    const partialEntity = adapter.fromMarkdown(markdown);

    expect(partialEntity.content).toBe(markdown);
    expect(partialEntity.entityType).toBe("link");
    expect(partialEntity.metadata?.status).toBe("draft");
    expect(partialEntity.metadata?.title).toBe("Test Article");
  });

  it("should extract metadata from entity", () => {
    const entity = createMockLinkEntity({
      id: "test-id",
      content: mockLinkContent.simple,
      metadata: { status: "draft", title: "Test Article" },
    });

    const metadata = adapter.extractMetadata(entity);
    expect(metadata).toEqual({ status: "draft", title: "Test Article" });
  });
});
