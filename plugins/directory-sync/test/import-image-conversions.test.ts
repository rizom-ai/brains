import { describe, expect, it, spyOn } from "bun:test";
import { createMockEntityService } from "@brains/entity-service/test";
import { createSilentLogger } from "@brains/test-utils";
import { queueImportImageConversions } from "../src/lib/import-image-conversions";
import { FrontmatterImageConverter } from "../src/lib/frontmatter-image-converter";
import { MarkdownImageConverter } from "../src/lib/markdown-image-converter";
import type { ImageJobQueueDeps } from "../src/lib/image-job-queue";
import type { RawEntity } from "../src/types";

function createDeps(): ImageJobQueueDeps {
  const entityService = createMockEntityService();
  const logger = createSilentLogger();
  return {
    logger,
    syncPath: "/tmp/sync",
    jobQueueCallback: async (): Promise<string> => "job",
    coverImageConverter: new FrontmatterImageConverter(entityService, logger),
    inlineImageConverter: new MarkdownImageConverter(entityService, logger),
  };
}

const raw = (entityType: string, content: string): RawEntity => ({
  entityType,
  id: "item",
  content,
  created: new Date(0),
  updated: new Date(0),
});

describe("queueImportImageConversions", () => {
  it("never scans binary entity content for markdown images", () => {
    const deps = createDeps();
    const cover = spyOn(deps.coverImageConverter, "detectCoverImageUrl");
    const inline = spyOn(deps.inlineImageConverter, "detectInlineImages");

    queueImportImageConversions(
      deps,
      raw("image", "data:image/png;base64,iVBORw0KGgo="),
      "image/item.png",
      { binaryStorage: "asset" },
    );

    expect(cover).not.toHaveBeenCalled();
    expect(inline).not.toHaveBeenCalled();
  });

  it("scans markdown entities for cover and inline images", () => {
    const deps = createDeps();
    const cover = spyOn(deps.coverImageConverter, "detectCoverImageUrl");
    const inline = spyOn(deps.inlineImageConverter, "detectInlineImages");

    queueImportImageConversions(
      deps,
      raw("note", "# Note\n\n![alt](https://example.com/a.png)"),
      "note/item.md",
      {},
    );

    expect(cover).toHaveBeenCalled();
    expect(inline).toHaveBeenCalled();
  });
});
