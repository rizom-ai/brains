import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { z } from "@brains/utils";
import { baseEntitySchema } from "../src/types";
import { BaseEntityAdapter } from "../src/adapters/base-entity-adapter";
import {
  setupEntityService,
  type EntityServiceTestContext,
} from "./helpers/setup-entity-service";

const markdownDocMetadataSchema = z.object({
  title: z.string(),
  slug: z.string(),
  status: z.string(),
});

type MarkdownDocMetadata = z.infer<typeof markdownDocMetadataSchema>;

const markdownDocSchema = baseEntitySchema.extend({
  entityType: z.literal("markdown-doc"),
  headline: z.string(),
  metadata: markdownDocMetadataSchema,
});

type MarkdownDoc = z.infer<typeof markdownDocSchema>;

class MarkdownDocAdapter extends BaseEntityAdapter<
  MarkdownDoc,
  MarkdownDocMetadata
> {
  constructor() {
    super({
      entityType: "markdown-doc",
      schema: markdownDocSchema,
      frontmatterSchema: markdownDocMetadataSchema,
    });
  }

  public override toMarkdown(entity: MarkdownDoc): string {
    return entity.content;
  }

  public fromMarkdown(markdown: string): Partial<MarkdownDoc> {
    const metadata = this.parseFrontMatter(markdown, markdownDocMetadataSchema);
    return {
      entityType: "markdown-doc",
      headline: metadata.title,
      content: markdown,
      metadata,
    };
  }
}

describe("EntityService.createEntityFromMarkdown", () => {
  let ctx: EntityServiceTestContext;

  beforeEach(async () => {
    ctx = await setupEntityService([]);
    ctx.entityRegistry.registerEntityType(
      "markdown-doc",
      markdownDocSchema,
      new MarkdownDocAdapter(),
    );
  });

  afterEach(async () => {
    await ctx.cleanup();
  });

  it("creates an adapter-validated entity from finalized markdown", async () => {
    const markdown = `---
title: Approved Markdown Doc
slug: approved-markdown-doc
status: draft
---

# Approved Markdown Doc

This content must be preserved exactly.`;

    const result = await ctx.entityService.createEntityFromMarkdown({
      entityType: "markdown-doc",
      id: "approved-markdown-doc",
      markdown,
    });

    expect(result.entityId).toBe("approved-markdown-doc");

    const stored = await ctx.entityService.getEntity<MarkdownDoc>({
      entityType: "markdown-doc",
      id: "approved-markdown-doc",
    });
    expect(stored?.content).toBe(markdown);
    expect(stored?.headline).toBe("Approved Markdown Doc");
    expect(stored?.metadata).toEqual({
      title: "Approved Markdown Doc",
      slug: "approved-markdown-doc",
      status: "draft",
    });
  });
});
