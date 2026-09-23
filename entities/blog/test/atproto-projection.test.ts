import { beforeEach, describe, expect, it, mock, spyOn } from "bun:test";
import {
  createServicePluginContext,
  generateMarkdownWithFrontmatter,
} from "@brains/plugins";
import {
  createMockServicePluginContext,
  createMockShell,
  createPluginHarness,
} from "@brains/plugins/test";
import { AtprotoProjectionRegistry } from "@brains/atproto-contracts";
import { BlogPlugin } from "../src/plugin";
import type { PublishImageData } from "@brains/contracts";
import type { AssetRef } from "@brains/assets";
import {
  AcknowledgedAtprotoCoverError,
  createBlogAtprotoProjection,
} from "../src/atproto-projection";
import { createMockPost } from "./fixtures/blog-entities";

const TINY_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

describe("blog ATProto projection", () => {
  beforeEach(() => {
    AtprotoProjectionRegistry.resetInstance();
  });

  it("maps blog posts to ai.rizom.brain.post records", async () => {
    const projection = createBlogAtprotoProjection();
    const entity = createMockPost(
      "post-1",
      "Distributed Brains",
      "distributed-brains",
      "published",
      { publishedAt: "2026-05-28T12:00:00.000Z" },
    );

    const record = await projection.buildRecord({
      entity,
      context: createMockServicePluginContext(),
      config: {
        brainDid: "did:web:brain.example.com",
      },
      topics: ["protocols"],
    });

    expect(projection.entityType).toBe("post");
    expect(projection.collection).toBe("ai.rizom.brain.post");
    expect(projection.validate).toBe(false);
    expect(record).toMatchObject({
      $type: "ai.rizom.brain.post",
      title: "Distributed Brains",
      format: "text/markdown",
      brainDid: "did:web:brain.example.com",
      topics: ["protocols"],
      sourceEntityType: "post",
      sourceEntityId: "post-1",
      publishedAt: "2026-05-28T12:00:00.000Z",
    });
  });

  it.each([
    "dry-run",
    "live",
    "retirement",
    "cancelled",
    "mismatch",
    "non-public",
  ])("publishes a scoped cover: %s", async (mode) => {
    const projection = createBlogAtprotoProjection();
    const entity = createMockPost(
      "post-1",
      "Distributed Brains",
      "distributed-brains",
      "published",
      { publishedAt: "2026-05-28T12:00:00.000Z" },
    );
    const postWithCover = {
      ...entity,
      content: generateMarkdownWithFrontmatter(
        "# Distributed Brains\n\nContent for Distributed Brains",
        {
          title: "Distributed Brains",
          slug: "distributed-brains",
          status: "published" as const,
          publishedAt: "2026-05-28T12:00:00.000Z",
          excerpt: "Excerpt for Distributed Brains",
          author: "Test Author",
          coverImageId: "image-1",
        },
      ),
    };
    const bytes = Buffer.from(TINY_PNG_BASE64, "base64");
    const digest = new Bun.CryptoHasher("sha256").update(bytes).digest("hex");
    const ref = `asset://sha256/${digest}` as const;
    const shell = createMockShell();
    shell.addEntities([postWithCover]);
    await shell.getEntityService().createEntity({
      entity: {
        id: "image-1",
        entityType: "image",
        content: ref,
        created: "2026-05-28T10:00:00.000Z",
        updated: "2026-05-28T10:00:00.000Z",
        visibility: "public" as const,
        metadata: {
          alt: "Cover alt",
          format: "png",
          mediaType: "image/png",
          sizeBytes: bytes.byteLength,
          width: 1200,
          height: 630,
        },
      },
      preparedAsset: { ref, digest, sizeBytes: bytes.byteLength, bytes },
    });
    const context = createServicePluginContext(shell, "blog");
    const storedImage = await context.entityService.getEntity({
      entityType: "image",
      id: "image-1",
    });
    if (!storedImage) throw new Error("Missing fixture image");
    const privateRead =
      mode === "non-public"
        ? spyOn(context.entityService, "getEntity").mockResolvedValue({
            ...storedImage,
            visibility: "restricted",
          })
        : undefined;
    const unexpected = async (): Promise<never> => {
      throw new Error("Unexpected file operation");
    };
    const readAsset = spyOn(
      context.entityService,
      "readAsset",
    ).mockImplementation(unexpected);
    const abort = new AbortController();
    const failure = new Error("Source retirement failed");
    let loans = 0;
    const uploadBlob = mock(async (file: PublishImageData) => {
      expect(loans).toBe(1);
      expect(file).toEqual({
        sourceFile: "/fixture/cover.png",
        sizeBytes: bytes.byteLength,
        sha256: digest,
        mimeType: "image/png",
        signal: abort.signal,
      });
      return {
        blob: {
          $type: "blob" as const,
          ref: { $link: "received-cid" },
          mimeType: file.mimeType,
          size: file.sizeBytes,
        },
      };
    });
    context.entityService.fileAssets = {
      withAssetFile: async <T>(
        ref: AssetRef,
        use: (
          file: Omit<PublishImageData, "mimeType" | "signal">,
          signal: AbortSignal,
        ) => Promise<T>,
      ): Promise<T> => {
        expect(ref).toBe(`asset://sha256/${digest}`);
        loans++;
        try {
          const result = await use(
            {
              sourceFile: "/fixture/cover.png",
              sizeBytes: bytes.byteLength,
              sha256: digest,
            },
            abort.signal,
          );
          if (mode === "retirement") throw failure;
          if (mode === "cancelled") abort.abort(failure);
          return result;
        } finally {
          loans--;
        }
      },
      inspect: async (): Promise<{
        sizeBytes: number;
        sha256: string;
        details: { mediaType: string; width: number; height: number };
      }> => ({
        sizeBytes: bytes.byteLength,
        sha256: mode === "mismatch" ? "0".repeat(64) : digest,
        details: { mediaType: "image/png", width: 1200, height: 630 },
      }),
      publish: unexpected,
      fingerprint: unexpected,
      download: unexpected,
      putHttp: unexpected,
      postHttp: unexpected,
      close: async (): Promise<void> => undefined,
    };

    try {
      const pending = projection.buildRecord({
        entity: postWithCover,
        context,
        config: {},
        dryRun: mode === "dry-run",
        client: {
          createSession: unexpected,
          createRecord: unexpected,
          uploadBlob,
        },
      });
      if (mode === "retirement" || mode === "cancelled") {
        await pending.then(unexpected, (error: unknown) => {
          expect(error).toBeInstanceOf(AcknowledgedAtprotoCoverError);
          if (!(error instanceof AcknowledgedAtprotoCoverError)) throw error;
          expect(error.cause).toBe(failure);
          expect(error.coverImage.blob.ref.$link).toBe("received-cid");
        });
      } else if (mode === "non-public") {
        await pending.then(unexpected, (error: unknown): void => {
          expect(error).toEqual(
            new Error("Cannot publish non-public cover image: image-1"),
          );
        });
      } else if (mode === "mismatch") {
        await pending.then(unexpected, (error: unknown): void => {
          expect(error).toEqual(
            new Error("Publishing file changed after acquisition"),
          );
        });
      } else {
        const record = await pending;
        expect(record.coverImage).toEqual({
          blob: {
            $type: "blob",
            ref: { $link: mode === "dry-run" ? "dry-run" : "received-cid" },
            mimeType: "image/png",
            size: bytes.byteLength,
          },
          alt: "Cover alt",
          width: 1200,
          height: 630,
        });
      }
      expect(loans).toBe(0);
      expect(readAsset).not.toHaveBeenCalled();
      expect(uploadBlob).toHaveBeenCalledTimes(
        mode === "dry-run" || mode === "mismatch" || mode === "non-public"
          ? 0
          : 1,
      );
    } finally {
      readAsset.mockRestore();
      privateRead?.mockRestore();
    }
  });

  it("stores the custom ATProto post URI in blog frontmatter after publish", async () => {
    const projection = createBlogAtprotoProjection();
    const entity = createMockPost(
      "post-1",
      "Distributed Brains",
      "distributed-brains",
      "published",
      { publishedAt: "2026-05-28T12:00:00.000Z" },
    );
    const shell = createMockShell();
    shell.addEntities([entity]);
    const context = createServicePluginContext(shell, "blog");
    const record = await projection.buildRecord({
      entity,
      context,
      config: {},
    });

    await projection.onPublished?.({
      entity,
      context,
      record,
      uri: "at://did:plc:repo/ai.rizom.brain.post/abc",
      cid: "cid",
    });

    const updated = await context.entityService.getEntity({
      entityType: "post",
      id: "post-1",
    });

    expect(updated?.content).toContain("atprotoUri:");
    expect(updated?.content).toContain(
      "at://did:plc:repo/ai.rizom.brain.post/abc",
    );
  });

  it("registers the blog projection when the blog plugin registers", async () => {
    const harness = createPluginHarness<BlogPlugin>({
      dataDir: "/tmp/test-blog",
    });

    await harness.installPlugin(new BlogPlugin({}));

    const projection = AtprotoProjectionRegistry.getInstance().get("post");
    expect(projection?.collection).toBe("ai.rizom.brain.post");
  });
});
