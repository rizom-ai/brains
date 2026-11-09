import { describe, expect, it } from "bun:test";
import type { AtprotoProjection } from "@brains/atproto-contracts";
import {
  createMockServicePluginContext,
  createPluginHarness,
} from "@brains/plugins/test";
import type { BlogPost, BlogPostStatus } from "../src/schemas/blog-post";
import { blogPlugin } from "./blog-plugin";

// A post as a declared type reads it: its metadata and its body.
function post(
  status: BlogPostStatus = "published",
  metadata: Partial<BlogPost["metadata"]> = {},
): BlogPost {
  return {
    id: "post-1",
    entityType: "post",
    content: "# Distributed Brains\n\nContent for Distributed Brains",
    created: "2026-05-28T10:00:00.000Z",
    updated: "2026-05-28T11:00:00.000Z",
    visibility: "public",
    contentHash: "hash",
    metadata: {
      title: "Distributed Brains",
      slug: "distributed-brains",
      authoredSlug: true,
      status,
      excerpt: "Excerpt for Distributed Brains",
      author: "Test Author",
      ...(status === "published" && {
        publishedAt: "2026-05-28T12:00:00.000Z",
      }),
      ...metadata,
    },
  };
}

async function installed(): Promise<{
  harness: ReturnType<typeof createPluginHarness>;
  projection: AtprotoProjection;
}> {
  const harness = createPluginHarness({ dataDir: "/tmp/test-blog-atproto" });
  await harness.installPlugin(blogPlugin());
  const projection = harness
    .getMockShell()
    .getAtprotoProjectionRegistry()
    .get("post");
  if (!projection) throw new Error("No post projection");
  return { harness, projection };
}

const context = createMockServicePluginContext();

describe("blog ATProto projection", () => {
  it("maps blog posts to ai.rizom.brain.post records", async () => {
    const { projection } = await installed();
    const record = await projection.buildRecord({
      entity: post("published", { seriesName: "Brains", seriesIndex: 2 }),
      context,
      config: { brainDid: "did:web:brain.example.com" },
      topics: ["protocols"],
    });

    expect(projection.collection).toBe("ai.rizom.brain.post");
    expect(projection.validate).toBe(false);
    expect(record).toEqual({
      $type: "ai.rizom.brain.post",
      title: "Distributed Brains",
      summary: "Excerpt for Distributed Brains",
      body: "# Distributed Brains\n\nContent for Distributed Brains",
      format: "text/markdown",
      brainDid: "did:web:brain.example.com",
      topics: ["protocols"],
      series: "Brains",
      seriesIndex: 2,
      sourceEntityType: "post",
      sourceEntityId: "post-1",
      createdAt: "2026-05-28T10:00:00.000Z",
      publishedAt: "2026-05-28T12:00:00.000Z",
    });
  });

  it("only treats published posts as publishable", async () => {
    const { projection } = await installed();
    expect(projection.isPublishable?.(post("published"))).toBe(true);
    for (const status of ["generating", "draft", "queued", "failed"] as const) {
      expect(projection.isPublishable?.(post(status))).toBe(false);
    }
  });

  it("names its page on this site, unless the essay was first published elsewhere", async () => {
    const { projection } = await installed();
    const pageUrl = "https://brain.example.com/essays/distributed-brains";
    const here = await projection.buildRecord({
      entity: post(),
      context,
      config: {},
      pageUrl,
    });
    expect(here["canonicalUrl"]).toBe(pageUrl);
    const elsewhere = await projection.buildRecord({
      entity: post("published", {
        canonicalUrl: "https://elsewhere.example/first",
      }),
      context,
      config: {},
      pageUrl,
    });
    expect(elsewhere["canonicalUrl"]).toBe("https://elsewhere.example/first");
    const unplaced = await projection.buildRecord({
      entity: post(),
      context,
      config: {},
    });
    expect(unplaced["canonicalUrl"]).toBeUndefined();
  });

  it("includes cover image shape during dry-run without uploading a blob", async () => {
    const { harness, projection } = await installed();
    harness.getMockShell().addEntities([
      {
        id: "image-1",
        entityType: "image",
        content: "data:image/png;base64,aGVsbG8=",
        created: "2026-05-28T10:00:00.000Z",
        updated: "2026-05-28T10:00:00.000Z",
        visibility: "public",
        contentHash: "image-hash",
        metadata: { alt: "Cover alt", format: "png", width: 1200, height: 630 },
      },
    ]);

    const record = await projection.buildRecord({
      entity: post("published", { coverImageId: "image-1" }),
      context,
      config: {},
      dryRun: true,
    });

    expect(record["coverImage"]).toEqual({
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

  it("leaves out a cover that is not public", async () => {
    const { harness, projection } = await installed();
    harness.getMockShell().addEntities([
      {
        id: "image-1",
        entityType: "image",
        content: "data:image/png;base64,aGVsbG8=",
        created: "2026-05-28T10:00:00.000Z",
        updated: "2026-05-28T10:00:00.000Z",
        visibility: "restricted",
        contentHash: "image-hash",
        metadata: { format: "png", width: 1200, height: 630 },
      },
    ]);
    const record = await projection.buildRecord({
      entity: post("published", { coverImageId: "image-1" }),
      context,
      config: {},
      dryRun: true,
    });
    expect(record["coverImage"]).toBeUndefined();
  });

  it("leaves a post untouched after publishing: nothing reads its ATProto URI", async () => {
    const { projection } = await installed();
    expect(projection.onPublished).toBeUndefined();
  });
});
