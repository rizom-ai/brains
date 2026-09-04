import { describe, expect, it } from "bun:test";
import {
  markEntityPublished,
  updatePublishFrontmatter,
} from "../src/publish-state-updater";
import type {
  BaseEntity,
  EntityMutationResult,
  UpdateEntityRequest,
} from "@brains/plugins";

describe("publish state updater", () => {
  it("updates status and publishedAt in existing frontmatter", () => {
    const updated = updatePublishFrontmatter(
      `---
title: Test
status: draft
---
Body`,
      "2026-06-04T12:00:00.000Z",
    );

    expect(updated).toContain("status: published");
    expect(updated).toContain("publishedAt: '2026-06-04T12:00:00.000Z'");
    expect(updated).toContain("Body");
  });

  it("updates configured provider result ID field in frontmatter", () => {
    const updated = updatePublishFrontmatter(
      `---
title: Test
status: draft
---
Body`,
      "2026-06-04T12:00:00.000Z",
      "urn:li:share:123",
      "platformPostId",
    );

    expect(updated).toContain("platformPostId: 'urn:li:share:123'");
  });

  it("does not add frontmatter to plain content", () => {
    const updated = updatePublishFrontmatter(
      "Plain publish content",
      "2026-06-04T12:00:00.000Z",
    );

    expect(updated).toBe("Plain publish content");
  });
});

describe("platform URL retention", () => {
  const entity = {
    id: "post-1",
    entityType: "social-post",
    content: "Body",
    visibility: "public" as const,
    contentHash: "hash",
    created: "2026-06-04T10:00:00.000Z",
    updated: "2026-06-04T10:00:00.000Z",
    metadata: {},
  };

  function captureUpdate(): {
    context: Parameters<typeof markEntityPublished>[0];
    updated: () => Record<string, unknown> | undefined;
  } {
    let seen: Record<string, unknown> | undefined;
    return {
      context: {
        entityService: {
          updateEntity: async <T extends BaseEntity>(
            request: UpdateEntityRequest<T>,
          ): Promise<EntityMutationResult> => {
            seen = request.entity.metadata;
            return { entityId: "post-1", jobId: "job-1", skipped: false };
          },
        },
      },
      updated: () => seen,
    };
  }

  it("stores the platform URL, which only the provider can construct", async () => {
    // platformId alone does not let anything else rebuild this: the URL
    // format lives inside the provider. Dropping it loses the fact.
    const { context, updated } = captureUpdate();

    await markEntityPublished(context, entity, {
      id: "urn:li:share:7",
      url: "https://www.linkedin.com/feed/update/urn:li:share:7",
    });

    expect(updated()?.["platformId"]).toBe("urn:li:share:7");
    expect(updated()?.["platformUrl"]).toBe(
      "https://www.linkedin.com/feed/update/urn:li:share:7",
    );
  });

  it("omits the field entirely when the provider returns no URL", async () => {
    const { context, updated } = captureUpdate();

    await markEntityPublished(context, entity, { id: "internal" });

    expect(updated()).not.toHaveProperty("platformUrl");
  });
});
