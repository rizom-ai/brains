import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import type { BaseEntity } from "../src/types";
import { postSchema, postAdapter } from "./helpers/test-schemas";
import {
  setupEntityService,
  type EntityServiceTestContext,
} from "./helpers/setup-entity-service";
import { insertTestEntity } from "./helpers/test-entity-db";

describe("listEntities sortFields", () => {
  let ctx: EntityServiceTestContext;

  const mockEmbedding = new Float32Array(384).fill(0.1);

  beforeEach(async () => {
    ctx = await setupEntityService([
      { name: "post", schema: postSchema, adapter: postAdapter },
    ]);

    await insertTestEntity(ctx.dbConfig, {
      id: "post-1",
      entityType: "post",
      content: "Post 1 content",
      metadata: {
        publishedAt: "2025-01-03T00:00:00.000Z",
        status: "published",
      },
      created: new Date("2025-01-01T10:00:00.000Z").getTime(),
      updated: new Date("2025-01-01T10:00:00.000Z").getTime(),
      embedding: mockEmbedding,
    });

    await insertTestEntity(ctx.dbConfig, {
      id: "post-2",
      entityType: "post",
      content: "Post 2 content",
      metadata: {
        publishedAt: "2025-01-01T00:00:00.000Z",
        status: "published",
      },
      created: new Date("2025-01-02T10:00:00.000Z").getTime(),
      updated: new Date("2025-01-02T10:00:00.000Z").getTime(),
      embedding: mockEmbedding,
    });

    await insertTestEntity(ctx.dbConfig, {
      id: "post-3",
      entityType: "post",
      content: "Post 3 content",
      metadata: {
        publishedAt: "2025-01-02T00:00:00.000Z",
        status: "draft",
      },
      created: new Date("2025-01-03T10:00:00.000Z").getTime(),
      updated: new Date("2025-01-03T10:00:00.000Z").getTime(),
      embedding: mockEmbedding,
    });
  });

  afterEach(async () => {
    await ctx.cleanup();
  });

  test("should sort by single metadata field (publishedAt desc)", async () => {
    const result = await ctx.entityService.listEntities<BaseEntity>("post", {
      sortFields: [{ field: "publishedAt", direction: "desc" }],
    });

    expect(result).toHaveLength(3);
    expect(result.map((r) => r.id)).toEqual(["post-1", "post-3", "post-2"]);
  });

  test("should sort by single metadata field (publishedAt asc)", async () => {
    const result = await ctx.entityService.listEntities<BaseEntity>("post", {
      sortFields: [{ field: "publishedAt", direction: "asc" }],
    });

    expect(result).toHaveLength(3);
    expect(result.map((r) => r.id)).toEqual(["post-2", "post-3", "post-1"]);
  });

  test("should sort by multiple metadata fields", async () => {
    const result = await ctx.entityService.listEntities<BaseEntity>("post", {
      sortFields: [
        { field: "status", direction: "asc" },
        { field: "publishedAt", direction: "desc" },
      ],
    });

    expect(result).toHaveLength(3);
    expect(result.map((r) => r.id)).toEqual(["post-3", "post-1", "post-2"]);
  });

  test("should sort by system field (created)", async () => {
    const result = await ctx.entityService.listEntities<BaseEntity>("post", {
      sortFields: [{ field: "created", direction: "asc" }],
    });

    expect(result).toHaveLength(3);
    expect(result.map((r) => r.id)).toEqual(["post-1", "post-2", "post-3"]);
  });

  test("should combine sortFields with pagination", async () => {
    const page1 = await ctx.entityService.listEntities<BaseEntity>("post", {
      sortFields: [{ field: "publishedAt", direction: "desc" }],
      limit: 2,
      offset: 0,
    });

    expect(page1).toHaveLength(2);
    expect(page1.map((r) => r.id)).toEqual(["post-1", "post-3"]);

    const page2 = await ctx.entityService.listEntities<BaseEntity>("post", {
      sortFields: [{ field: "publishedAt", direction: "desc" }],
      limit: 2,
      offset: 2,
    });

    expect(page2).toHaveLength(1);
    expect(page2.map((r) => r.id)).toEqual(["post-2"]);
  });

  test("should combine sortFields with publishedOnly filter", async () => {
    const result = await ctx.entityService.listEntities<BaseEntity>("post", {
      sortFields: [{ field: "publishedAt", direction: "desc" }],
      publishedOnly: true,
    });

    expect(result).toHaveLength(2);
    expect(result.map((r) => r.id)).toEqual(["post-1", "post-2"]);
  });

  test("should include entities WITHOUT status field when publishedOnly is true", async () => {
    await insertTestEntity(ctx.dbConfig, {
      id: "post-no-status",
      entityType: "post",
      content: "Post without status field",
      metadata: { publishedAt: "2025-01-04T00:00:00.000Z" },
      created: new Date("2025-01-04T10:00:00.000Z").getTime(),
      updated: new Date("2025-01-04T10:00:00.000Z").getTime(),
      embedding: mockEmbedding,
    });

    const result = await ctx.entityService.listEntities<BaseEntity>("post", {
      publishedOnly: true,
    });

    expect(result).toHaveLength(3);
    expect(result.map((r) => r.id).sort()).toEqual([
      "post-1",
      "post-2",
      "post-no-status",
    ]);
  });

  test("should return all entities when no limit is specified", async () => {
    const result = await ctx.entityService.listEntities<BaseEntity>("post");
    expect(result).toHaveLength(3);
  });

  test("should respect explicit limit when provided", async () => {
    const result = await ctx.entityService.listEntities<BaseEntity>("post", {
      limit: 2,
    });
    expect(result).toHaveLength(2);
  });
});
