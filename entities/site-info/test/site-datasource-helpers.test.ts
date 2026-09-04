import { describe, it, expect } from "bun:test";
import { createMockShell } from "@brains/plugins/test";
import { baseEntitySchema } from "@brains/plugins";
import { z } from "@brains/utils/zod";
import {
  fetchRecentEntities,
  requireCta,
} from "../src/datasources/site-datasource-helpers";
import type { SiteInfoCTA } from "../src/schemas/site-info-schema";

function isoDaysAgo(days: number): string {
  return new Date(Date.UTC(2026, 0, 1 + days)).toISOString();
}

describe("site datasource helpers", () => {
  describe("fetchRecentEntities", () => {
    const postSchema = baseEntitySchema.extend({
      metadata: z.object({ publishedAt: z.string().optional() }),
    });
    type Post = z.output<typeof postSchema>;

    function seedPosts(): ReturnType<typeof createMockShell> {
      const shell = createMockShell();
      shell.addEntities(
        [0, 1, 2, 3].map((i) => ({
          id: `post-${i}`,
          entityType: "post",
          content: `post ${i}`,
          contentHash: `h${i}`,
          visibility: "public" as const,
          metadata: { publishedAt: isoDaysAgo(i) },
          created: isoDaysAgo(i),
          updated: isoDaysAgo(i),
        })),
      );
      return shell;
    }

    it("returns entities newest-first, capped at count, mapped by parse", async () => {
      const shell = seedPosts();

      const ids = await fetchRecentEntities<Post, string>(
        shell.getEntityService(),
        {
          entityType: "post",
          entitySchema: postSchema,
          count: 2,
          parse: (p) => p.id,
        },
      );

      // post-3 is newest (largest day offset); count caps to 2
      expect(ids).toEqual(["post-3", "post-2"]);
    });

    it("returns all when fewer than count exist", async () => {
      const shell = seedPosts();

      const ids = await fetchRecentEntities<Post, string>(
        shell.getEntityService(),
        {
          entityType: "post",
          entitySchema: postSchema,
          count: 10,
          parse: (p) => p.id,
        },
      );

      expect(ids).toHaveLength(4);
    });
  });

  describe("requireCta", () => {
    it("returns the CTA when present", () => {
      const cta: SiteInfoCTA = {
        heading: "Get in touch",
        buttonText: "Contact",
        buttonLink: "/contact",
      };
      expect(requireCta(cta)).toBe(cta);
    });

    it("throws a clear error when absent", () => {
      expect(() => requireCta(undefined)).toThrow(
        "CTA not configured in site-info",
      );
    });
  });
});
