import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createMockEntityService } from "@brains/entity-service/test";
import { describe, expect, it } from "bun:test";
import type { EntityPluginContext } from "@brains/plugins";
import { createBlogOgImageProvider } from "../../src/attachments/og-image-provider";
import { BLOG_OG_IMAGE_ATTACHMENT_TYPE } from "../../src/attachments/og-image-template";

const unexpected = async (): Promise<never> => {
  throw new Error("Unexpected file operation");
};

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
      getProfile: () => ({ name: "Rizom" }),
      getAppInfo: async () => ({
        entities: 0,
        embeddings: 0,
        version: "0.0.0",
        model: "test",
        uptime: 0,
        entityCounts: [],
        backgroundWork: {
          status: "operational" as const,
          reasons: [],
          worker: {
            state: "active" as const,
            activeSessions: 1,
            staleSessions: 0,
            latestHeartbeatAgeMs: 0,
          },
          queue: {
            duePending: 0,
            processing: 0,
            oldestDuePendingAgeMs: null,
            latestClaimAgeMs: null,
            stalled: false,
          },
        },
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
    const context = createContext();
    context.entityService.fileAssets = {
      inspect: unexpected,
      publish: unexpected,
      putHttp: unexpected,
      postHttp: unexpected,
      withAssetFile: unexpected,
      download: unexpected,
      fingerprint: unexpected,
      close: async (): Promise<void> => undefined,
      withProducedFile: async (
        directory,
        use,
        options,
      ): ReturnType<typeof use> => {
        expect(await readFile(join(directory, "index.html"), "utf8")).toContain(
          "Resilience Is Not Redundancy",
        );
        return use(
          {
            sourceFile: join(directory, "rendered.png"),
            sizeBytes: 8,
            sha256: "a".repeat(64),
          },
          options?.signal ?? new AbortController().signal,
        );
      },
    };
    const attachment = await createBlogOgImageProvider(context).withFile(
      {
        sourceEntityType: "post",
        sourceEntityId: "resilience",
        attachmentType: BLOG_OG_IMAGE_ATTACHMENT_TYPE,
      },
      async (file) => file,
    );
    expect(attachment).toEqual({
      type: "image",
      mimeType: "image/png",
      filename: "resilience-og.png",
      sha256: "a".repeat(64),
      source: { sourceFile: expect.any(String), sizeBytes: 8 },
    });
  });

  it("returns undefined for non-OG requests", async () => {
    const provider = createBlogOgImageProvider(createContext());
    const attachment = await provider.withFile(
      {
        sourceEntityType: "post",
        sourceEntityId: "resilience",
        attachmentType: "printable",
      },
      async (file) => file,
    );

    expect(attachment).toBeUndefined();
  });
});
