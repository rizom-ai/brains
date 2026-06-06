import { describe, expect, it } from "bun:test";
import { createMockEntityService } from "@brains/test-utils";
import type { EntityPluginContext } from "@brains/plugins";
import { BlogOgImageAttachmentProvider } from "../../src/attachments/og-image-provider";
import { BLOG_OG_IMAGE_ATTACHMENT_TYPE } from "../../src/attachments/og-image-template";

const TINY_PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function createContext(): Pick<
  EntityPluginContext,
  "entityService" | "themeCSS" | "identity" | "domain"
> {
  return {
    entityService: createMockEntityService({
      entityTypes: ["post", "image"],
      returns: {
        getEntity: {
          id: "resilience",
          entityType: "post",
          content: `---
title: Resilience Is Not Redundancy
slug: resilience
status: published
excerpt: Robust systems are not piles of backups.
author: Test Author
publishedAt: "2026-01-10T12:00:00.000Z"
coverImageId: cover-image
---
Body`,
          metadata: {
            title: "Resilience Is Not Redundancy",
            slug: "resilience",
            status: "published",
          },
          contentHash: "hash",
          visibility: "public",
          created: "2026-01-01T00:00:00.000Z",
          updated: "2026-01-01T00:00:00.000Z",
        },
      },
    }),
    themeCSS: "",
    identity: {
      get: () => ({
        name: "Rizom",
        role: "test",
        purpose: "testing",
        values: [],
      }),
      getProfile: () => ({ name: "Rizom", kind: "professional" as const }),
      getAppInfo: async () => ({
        entities: 0,
        embeddings: 0,
        version: "0.0.0",
        model: "test",
        uptime: 0,
        entityCounts: [],
        ai: { model: "test", embeddingModel: "test" },
        daemons: [],
        endpoints: [],
        interactions: [],
      }),
    },
    domain: "example.com",
  };
}

describe("Blog OG image attachment provider", () => {
  it("resolves a post into a PNG OG image attachment", async () => {
    const provider = new BlogOgImageAttachmentProvider(createContext(), {
      screenshotPng: async (_url, viewport): Promise<Buffer> => {
        expect(viewport).toEqual({ width: 1200, height: 630 });
        return TINY_PNG;
      },
    });

    const attachment = await provider.resolve({
      sourceEntityType: "post",
      sourceEntityId: "resilience",
      attachmentType: BLOG_OG_IMAGE_ATTACHMENT_TYPE,
    });

    expect(attachment).toEqual({
      type: "image",
      data: TINY_PNG,
      mimeType: "image/png",
      filename: "resilience-og.png",
    });
  });

  it("returns undefined for non-OG requests", async () => {
    const provider = new BlogOgImageAttachmentProvider(createContext(), {
      screenshotPng: async (): Promise<Buffer> => TINY_PNG,
    });

    const attachment = await provider.resolve({
      sourceEntityType: "post",
      sourceEntityId: "resilience",
      attachmentType: "printable",
    });

    expect(attachment).toBeUndefined();
  });
});
