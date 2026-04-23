/**
 * Stability guarantees for the BaseEntityAdapter.toMarkdown default.
 *
 * These tests pin the contract that adapters rely on when they delete
 * their verbatim `return entity.content;` override and inherit the
 * default rebuild-from-metadata behavior.
 */
import { describe, it, expect } from "bun:test";
import { z } from "@brains/utils";
import { BaseEntityAdapter } from "../src/adapters/base-entity-adapter";
import { baseEntitySchema } from "../src/types";

const frontmatterSchema = z.object({
  title: z.string(),
  status: z.enum(["draft", "published"]),
  extra: z.string().optional(),
});

const entitySchema = baseEntitySchema.extend({
  entityType: z.literal("test"),
  metadata: frontmatterSchema,
});

type TestEntity = z.infer<typeof entitySchema>;
type TestMetadata = TestEntity["metadata"];

class DefaultingAdapter extends BaseEntityAdapter<TestEntity, TestMetadata> {
  constructor() {
    super({
      entityType: "test",
      schema: entitySchema,
      frontmatterSchema,
    });
  }

  public fromMarkdown(markdown: string): Partial<TestEntity> {
    const frontmatter = this.parseFrontMatter(markdown, frontmatterSchema);
    return {
      content: markdown,
      entityType: "test",
      metadata: frontmatter,
    };
  }
}

const adapter = new DefaultingAdapter();

function buildEntity(content: string, metadata: TestMetadata): TestEntity {
  return {
    id: "t1",
    entityType: "test",
    content,
    contentHash: "h",
    created: "2026-04-20T00:00:00.000Z",
    updated: "2026-04-20T00:00:00.000Z",
    metadata,
  };
}

describe("BaseEntityAdapter.toMarkdown default — stability", () => {
  it("round-trip of an in-sync entity preserves metadata semantically", () => {
    // Disk content and metadata agree — this is the common case for
    // adapters that used to say `return entity.content;`.
    const content = `---\ntitle: Hello\nstatus: published\n---\nBody text.\n`;
    const entity = buildEntity(content, {
      title: "Hello",
      status: "published",
    });

    const output = adapter.toMarkdown(entity);
    const reparsed = adapter.fromMarkdown(output);

    expect(reparsed.metadata).toEqual(entity.metadata);
  });

  it("body content is byte-identical after round-trip", () => {
    const content = `---\ntitle: Hi\nstatus: draft\n---\nLine one.\n\nLine two.\n`;
    const entity = buildEntity(content, { title: "Hi", status: "draft" });

    const output = adapter.toMarkdown(entity);
    const bodyOf = (md: string): string => md.replace(/^---[\s\S]*?---\n?/, "");

    expect(bodyOf(output).trim()).toBe(bodyOf(content).trim());
  });

  it("preserves frontmatter fields present on disk that metadata does not carry", () => {
    // `extra` is in the frontmatter schema but not in this entity's metadata.
    // Default overlays metadata on top of existing frontmatter, so `extra`
    // survives untouched.
    const content = `---\ntitle: T\nstatus: draft\nextra: keep-me\n---\nBody.\n`;
    const entity = buildEntity(content, { title: "T", status: "draft" });

    const output = adapter.toMarkdown(entity);

    expect(output).toContain("extra: keep-me");
  });

  it("DB metadata wins over stale frontmatter", () => {
    const content = `---\ntitle: Old\nstatus: draft\n---\nBody.\n`;
    const entity = buildEntity(content, {
      title: "New",
      status: "published",
    });

    const output = adapter.toMarkdown(entity);

    expect(output).toContain("title: New");
    expect(output).toContain("status: published");
    expect(output).not.toContain("title: Old");
  });

  it("adds frontmatter when disk content has none", () => {
    const entity = buildEntity("Just a body.", {
      title: "Fresh",
      status: "draft",
    });

    const output = adapter.toMarkdown(entity);

    expect(output).toMatch(/^---\n/);
    expect(output).toContain("title: Fresh");
    expect(output).toContain("Just a body.");
  });
});
