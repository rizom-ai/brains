import { describe, it, expect, beforeEach, spyOn } from "bun:test";
import { socialPostDataSource } from "../src/datasources/social-post-datasource";
import { createDeclarativeEntityDataSource } from "@brains/plugins";
import type { BaseDataSourceContext, IEntityService } from "@brains/plugins";
import { z } from "@brains/utils/zod";
import {
  createMockEntityService,
  createMockLogger,
  createTestEntity,
} from "@brains/test-utils";
import type { SocialPost } from "../src/schemas/social-post";

describe("socialPostDataSource", () => {
  let datasource: ReturnType<typeof createDeclarativeEntityDataSource>;
  let entityService: IEntityService;
  let logger: ReturnType<typeof createMockLogger>;
  let context: BaseDataSourceContext;

  function createMockSocialPost(
    id: string,
    title: string,
    slug: string,
    status: "draft" | "queued" | "published" | "failed",
    body: string,
  ): SocialPost {
    return createTestEntity<SocialPost>("social-post", {
      id,
      content: `---\ntitle: ${title}\nplatform: linkedin\nstatus: ${status}\n---\n\n${body}`,
      metadata: { title, slug, platform: "linkedin", status },
    });
  }

  beforeEach(() => {
    logger = createMockLogger();
    entityService = createMockEntityService();
    context = { entityService };
    datasource = createDeclarativeEntityDataSource(
      socialPostDataSource,
      "@brains/social-media:posts",
      logger,
    );
  });

  describe("a single post", () => {
    const detailSchema = z.object({ post: z.any() });

    it("is fetched by slug", async () => {
      const post = createMockSocialPost(
        "linkedin-my-post",
        "My Post",
        "linkedin-my-post",
        "draft",
        "Post body",
      );
      spyOn(entityService, "listEntities").mockResolvedValue([post]);

      const result = await datasource.fetch(
        { entityType: "social-post", query: { id: "linkedin-my-post" } },
        detailSchema,
        context,
      );

      expect(result.post).toMatchObject({
        id: "linkedin-my-post",
        body: "Post body",
      });
    });

    it("throws when no post has that slug", async () => {
      spyOn(entityService, "listEntities").mockResolvedValue([]);

      expect(
        datasource.fetch(
          { entityType: "social-post", query: { id: "missing" } },
          detailSchema,
          context,
        ),
      ).rejects.toThrow();
    });
  });

  describe("a list of posts", () => {
    const listSchema = z.object({
      posts: z.array(z.any()),
      totalCount: z.number(),
      pagination: z.any(),
      baseUrl: z.any(),
    });

    it("returns every post with its total", async () => {
      spyOn(entityService, "listEntities").mockResolvedValue([
        createMockSocialPost("a", "A", "linkedin-a", "published", "Body A"),
        createMockSocialPost("b", "B", "linkedin-b", "draft", "Body B"),
      ]);

      const result = await datasource.fetch(
        { entityType: "social-post", query: {} },
        listSchema,
        context,
      );

      expect(result.posts).toHaveLength(2);
      expect(result.totalCount).toBe(2);
    });

    it("carries the base url a caller supplied", async () => {
      spyOn(entityService, "listEntities").mockResolvedValue([]);

      const result = await datasource.fetch(
        {
          entityType: "social-post",
          query: { baseUrl: "https://example.com" },
        },
        listSchema,
        context,
      );

      expect(result.baseUrl).toBe("https://example.com");
    });

    // Paging is pushed down to the entity service rather than sliced in
    // memory, so what matters is the window it asks for.
    it("asks the entity service for the page it was given", async () => {
      const listEntities = spyOn(entityService, "listEntities");
      listEntities.mockResolvedValue([]);

      await datasource.fetch(
        { entityType: "social-post", query: { page: 3, pageSize: 2 } },
        listSchema,
        context,
      );

      expect(listEntities).toHaveBeenCalledWith(
        expect.objectContaining({
          entityType: "social-post",
          options: expect.objectContaining({ limit: 2, offset: 4 }),
        }),
        expect.anything(),
      );
    });
  });
});
