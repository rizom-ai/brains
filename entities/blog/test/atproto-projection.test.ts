import { beforeEach, describe, expect, it } from "bun:test";
import {
  createServicePluginContext,
  generateMarkdownWithFrontmatter,
} from "@brains/plugins";
import {
  createMockServicePluginContext,
  createMockShell,
} from "@brains/test-utils";
import { createPluginHarness } from "@brains/plugins/test";
import { AtprotoProjectionRegistry } from "@brains/atproto-contracts";
import { BlogPlugin } from "../src/plugin";
import { createBlogAtprotoProjection } from "../src/atproto-projection";
import { createMockPost } from "./fixtures/blog-entities";

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

  it("includes cover image shape during dry-run without uploading a blob", async () => {
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
    const image = {
      id: "image-1",
      entityType: "image",
      content: "data:image/png;base64,aGVsbG8=",
      created: "2026-05-28T10:00:00.000Z",
      updated: "2026-05-28T10:00:00.000Z",
      visibility: "public" as const,
      contentHash: "image-hash",
      metadata: { alt: "Cover alt", width: 1200, height: 630 },
    };
    const shell = createMockShell();
    shell.addEntities([postWithCover, image]);
    const context = createServicePluginContext(shell, "blog");

    const record = await projection.buildRecord({
      entity: postWithCover,
      context,
      config: {},
      dryRun: true,
    });

    expect(record.coverImage).toEqual({
      blob: {
        $type: "blob",
        ref: { $link: "dry-run" },
        mimeType: "image/png",
        size: 5,
      },
      alt: "Cover alt",
      width: 1200,
      height: 630,
    });
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
