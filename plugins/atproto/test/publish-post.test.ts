import { describe, expect, it, mock } from "bun:test";
import { createServicePluginContext } from "@brains/plugins";
import type { BaseEntity, ServicePluginContext } from "@brains/plugins";
import { createMockShell } from "@brains/test-utils";
import type { BlogPost } from "@brains/blog";
import { blogPostAdapter, blogPostSchema } from "@brains/blog";
import {
  AtprotoPlugin,
  AtprotoProjectionRegistry,
  atprotoPlugin,
  type AtprotoPdsClientLike,
} from "../src";

function createBlogPost(
  input: { visibility?: "public" | "private"; coverImageId?: string } = {},
): BlogPost {
  const content = blogPostAdapter.createPostContent(
    {
      title: "Distributed Brains",
      slug: "distributed-brains",
      status: "published",
      publishedAt: "2026-05-28T12:00:00.000Z",
      excerpt: "How brains publish to the open social web.",
      author: "Yeehaa",
      canonicalUrl: "https://brain.example.com/blog/distributed-brains",
      ...(input.coverImageId && { coverImageId: input.coverImageId }),
    },
    "Brains should publish projections, not duplicate content models.",
  );

  return blogPostSchema.parse({
    id: "post-123",
    entityType: "post",
    content,
    created: "2026-05-28T10:00:00.000Z",
    updated: "2026-05-28T12:30:00.000Z",
    visibility: input.visibility ?? "public",
    contentHash: "hash",
    metadata: {
      title: "Distributed Brains",
      slug: "distributed-brains",
      status: "published",
      publishedAt: "2026-05-28T12:00:00.000Z",
    },
  });
}

function createImageEntity(
  input: { visibility?: "public" | "restricted" } = {},
): BaseEntity {
  return {
    id: "image-123",
    entityType: "image",
    content: "data:image/png;base64,aGVsbG8=",
    created: "2026-05-28T09:00:00.000Z",
    updated: "2026-05-28T09:00:00.000Z",
    visibility: input.visibility ?? "public",
    contentHash: "image-hash",
    metadata: {
      title: "Cover image",
      alt: "Diagram of distributed brains",
      format: "png",
      width: 1200,
      height: 630,
    },
  };
}

function createContext(
  post: BlogPost = createBlogPost(),
  extraEntities: BaseEntity[] = [],
): ServicePluginContext {
  const shell = createMockShell({ domain: "brain.example.com" });
  shell.addEntities([post, ...extraEntities]);
  return createServicePluginContext(shell, "atproto");
}

describe("AT Protocol post publishing", () => {
  it("dry-runs a post record by slug without writing to the PDS", async () => {
    const createRecord = mock(async () => ({
      uri: "at://repo/post",
      cid: "cid",
    }));
    const plugin = new AtprotoPlugin(
      {
        pdsEndpoint: "https://pds.example.com",
        identifier: "brain.example.com",
        appPassword: "secret",
        repoDid: "did:plc:repo",
      },
      {
        createPdsClient: (): AtprotoPdsClientLike => ({
          createSession: mock(async () => ({
            did: "did:plc:repo",
            handle: "brain.example.com",
            accessJwt: "access-token",
            refreshJwt: "refresh-token",
          })),
          createRecord,
        }),
      },
    );

    const result = await plugin.publishPost(createContext(), {
      slug: "distributed-brains",
      dryRun: true,
    });

    expect(result.record.sourceEntityId).toBe("post-123");
    expect(result.record.title).toBe("Distributed Brains");
    expect(createRecord).not.toHaveBeenCalled();
  });

  it("dry-runs a post record without writing to the PDS", async () => {
    const createRecord = mock(async () => ({
      uri: "at://repo/post",
      cid: "cid",
    }));
    const plugin = new AtprotoPlugin(
      {
        pdsEndpoint: "https://pds.example.com",
        identifier: "brain.example.com",
        appPassword: "secret",
        repoDid: "did:plc:repo",
        brainDid: "did:web:brain.example.com",
        anchorDid: "did:plc:anchor",
      },
      {
        createPdsClient: (): AtprotoPdsClientLike => ({
          createSession: mock(async () => ({
            did: "did:plc:repo",
            handle: "brain.example.com",
            accessJwt: "access-token",
            refreshJwt: "refresh-token",
          })),
          createRecord,
        }),
      },
    );

    const result = await plugin.publishPost(createContext(), {
      entityId: "post-123",
      topics: ["protocols"],
      dryRun: true,
    });

    expect(result).toMatchObject({
      dryRun: true,
      repo: "did:plc:repo",
      record: {
        $type: "ai.rizom.brain.post",
        sourceEntityType: "post",
        sourceEntityId: "post-123",
        brainDid: "did:web:brain.example.com",
        anchorDid: "did:plc:anchor",
        topics: ["protocols"],
      },
    });
    expect(createRecord).not.toHaveBeenCalled();
  });

  it("uploads a post cover image before publishing the record", async () => {
    const createSession = mock(async () => ({
      did: "did:plc:session-repo",
      handle: "brain.example.com",
      accessJwt: "access-token",
      refreshJwt: "refresh-token",
    }));
    const uploadBlob = mock(async () => ({
      blob: { ref: { $link: "blob-cid" }, mimeType: "image/png", size: 5 },
    }));
    const createRecord = mock(async () => ({
      uri: "at://repo/post",
      cid: "cid",
    }));
    const plugin = new AtprotoPlugin(
      {
        pdsEndpoint: "https://pds.example.com",
        identifier: "brain.example.com",
        appPassword: "secret",
      },
      {
        createPdsClient: (): AtprotoPdsClientLike => ({
          createSession,
          uploadBlob,
          createRecord,
        }),
      },
    );

    const result = await plugin.publishPost(
      createContext(createBlogPost({ coverImageId: "image-123" }), [
        createImageEntity(),
      ]),
      { entityId: "post-123" },
    );

    expect(uploadBlob).toHaveBeenCalledWith({
      data: Buffer.from("aGVsbG8=", "base64"),
      mimeType: "image/png",
    });
    expect(result.record.coverImage).toEqual({
      blob: { ref: { $link: "blob-cid" }, mimeType: "image/png", size: 5 },
      alt: "Diagram of distributed brains",
      width: 1200,
      height: 630,
    });
    expect(createRecord).toHaveBeenCalledWith({
      repo: "did:plc:session-repo",
      collection: "ai.rizom.brain.post",
      validate: false,
      record: result.record,
    });
  });

  it("refuses to publish a private cover image", async () => {
    const plugin = new AtprotoPlugin(
      {
        pdsEndpoint: "https://pds.example.com",
        identifier: "brain.example.com",
        appPassword: "secret",
      },
      {
        createPdsClient: (): AtprotoPdsClientLike => ({
          createSession: mock(async () => ({
            did: "did:plc:session-repo",
            handle: "brain.example.com",
            accessJwt: "access-token",
            refreshJwt: "refresh-token",
          })),
          uploadBlob: mock(async () => ({
            blob: {
              ref: { $link: "blob-cid" },
              mimeType: "image/png",
              size: 5,
            },
          })),
          createRecord: mock(async () => ({
            uri: "at://repo/post",
            cid: "cid",
          })),
        }),
      },
    );

    try {
      await plugin.publishPost(
        createContext(createBlogPost({ coverImageId: "image-123" }), [
          createImageEntity({ visibility: "restricted" }),
        ]),
        { entityId: "post-123" },
      );
      throw new Error("Expected private cover image publish to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toContain(
        "Cannot publish non-public cover image",
      );
    }
  });

  it("publishes using the registered ATProto projection for the entity type", async () => {
    const registry = AtprotoProjectionRegistry.createFresh();
    const buildRecord = mock(async () => ({
      $type: "ai.example.customPost",
      title: "Custom projection",
      body: "Custom body",
      createdAt: "2026-05-28T10:00:00.000Z",
      sourceEntityType: "post",
      sourceEntityId: "post-123",
    }));
    registry.register({
      entityType: "post",
      collection: "ai.example.customPost",
      validate: false,
      buildRecord,
    });
    const createRecord = mock(async () => ({
      uri: "at://repo/custom-post",
      cid: "cid",
    }));
    const plugin = new AtprotoPlugin(
      {
        pdsEndpoint: "https://pds.example.com",
        identifier: "brain.example.com",
        appPassword: "secret",
      },
      {
        projectionRegistry: registry,
        createPdsClient: (): AtprotoPdsClientLike => ({
          createSession: mock(async () => ({
            did: "did:plc:session-repo",
            handle: "brain.example.com",
            accessJwt: "access-token",
            refreshJwt: "refresh-token",
          })),
          createRecord,
        }),
      },
    );

    const result = await plugin.publishPost(createContext(), {
      entityId: "post-123",
    });

    expect(result.uri).toBe("at://repo/custom-post");
    expect(buildRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        entity: expect.objectContaining({ id: "post-123" }),
        config: expect.objectContaining({ identifier: "brain.example.com" }),
      }),
    );
    expect(createRecord).toHaveBeenCalledWith({
      repo: "did:plc:session-repo",
      collection: "ai.example.customPost",
      validate: false,
      record: result.record,
    });
  });

  it("publishes a post record to the configured PDS repo", async () => {
    const createSession = mock(async () => ({
      did: "did:plc:session-repo",
      handle: "brain.example.com",
      accessJwt: "access-token",
      refreshJwt: "refresh-token",
    }));
    const createRecord = mock(async () => ({
      uri: "at://repo/post",
      cid: "cid",
    }));
    const plugin = new AtprotoPlugin(
      {
        pdsEndpoint: "https://pds.example.com",
        identifier: "brain.example.com",
        appPassword: "secret",
        brainDid: "did:web:brain.example.com",
      },
      {
        createPdsClient: (): AtprotoPdsClientLike => ({
          createSession,
          createRecord,
        }),
      },
    );

    const result = await plugin.publishPost(createContext(), {
      entityId: "post-123",
    });

    expect(result.dryRun).toBe(false);
    expect(result.repo).toBe("did:plc:session-repo");
    expect(result.uri).toBe("at://repo/post");
    expect(createRecord).toHaveBeenCalledWith({
      repo: "did:plc:session-repo",
      collection: "ai.rizom.brain.post",
      validate: false,
      record: result.record,
    });
  });

  it("cross-posts uploaded cover images to Bluesky image embeds", async () => {
    const createSession = mock(async () => ({
      did: "did:plc:session-repo",
      handle: "brain.example.com",
      accessJwt: "access-token",
      refreshJwt: "refresh-token",
    }));
    const uploadBlob = mock(async () => ({
      blob: {
        ref: { $link: "blob-cid" },
        mimeType: "image/png",
        size: 5,
      },
    }));
    const createRecord = mock(async (input: { collection: string }) => ({
      uri: `at://repo/${input.collection}`,
      cid: `${input.collection}-cid`,
    }));
    const plugin = new AtprotoPlugin(
      {
        pdsEndpoint: "https://pds.example.com",
        identifier: "brain.example.com",
        appPassword: "secret",
      },
      {
        createPdsClient: (): AtprotoPdsClientLike => ({
          createSession,
          uploadBlob,
          createRecord,
        }),
      },
    );

    const result = await plugin.publishPost(
      createContext(createBlogPost({ coverImageId: "image-123" }), [
        createImageEntity(),
      ]),
      { entityId: "post-123", crossPostToBluesky: true },
    );

    expect(result.bluesky?.record.embed).toEqual({
      $type: "app.bsky.embed.images",
      images: [
        {
          image: { ref: { $link: "blob-cid" }, mimeType: "image/png", size: 5 },
          alt: "Diagram of distributed brains",
          aspectRatio: { width: 1200, height: 630 },
        },
      ],
    });
  });

  it("can cross-post a Bluesky summary after publishing the custom record", async () => {
    const createSession = mock(async () => ({
      did: "did:plc:session-repo",
      handle: "brain.example.com",
      accessJwt: "access-token",
      refreshJwt: "refresh-token",
    }));
    const createRecord = mock(async (input: { collection: string }) => ({
      uri: `at://repo/${input.collection}`,
      cid: `${input.collection}-cid`,
    }));
    const plugin = new AtprotoPlugin(
      {
        pdsEndpoint: "https://pds.example.com",
        identifier: "brain.example.com",
        appPassword: "secret",
      },
      {
        createPdsClient: (): AtprotoPdsClientLike => ({
          createSession,
          createRecord,
        }),
      },
    );

    const result = await plugin.publishPost(createContext(), {
      entityId: "post-123",
      crossPostToBluesky: true,
    });

    expect(result.bluesky?.uri).toBe("at://repo/app.bsky.feed.post");
    expect(createRecord).toHaveBeenCalledTimes(2);
    expect(createRecord).toHaveBeenLastCalledWith({
      repo: "did:plc:session-repo",
      collection: "app.bsky.feed.post",
      validate: true,
      record: result.bluesky?.record,
    });
  });

  it("refuses to publish private posts", async () => {
    const plugin = atprotoPlugin({
      pdsEndpoint: "https://pds.example.com",
      identifier: "brain.example.com",
      appPassword: "secret",
    });

    try {
      await plugin.publishPost(
        createContext(createBlogPost({ visibility: "private" })),
        {
          entityId: "post-123",
          dryRun: true,
        },
      );
      throw new Error("Expected private post publish to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toContain(
        "Cannot publish non-public post",
      );
    }
  });

  it("exposes a publish-post tool that can dry-run by slug", async () => {
    const shell = createMockShell({ domain: "brain.example.com" });
    shell.addEntities([createBlogPost()]);
    const plugin = atprotoPlugin({
      pdsEndpoint: "https://pds.example.com",
      identifier: "brain.example.com",
      brainDid: "did:web:brain.example.com",
    });
    const capabilities = await plugin.register(shell);
    const tool = capabilities.tools.find(
      (candidate) => candidate.name === "atproto_publish_post",
    );

    expect(tool).toBeDefined();
    const response = await tool?.handler(
      { slug: "distributed-brains", dryRun: true },
      { interfaceType: "test", userId: "test" },
    );
    expect(response).toMatchObject({
      success: true,
      data: {
        dryRun: true,
        record: { $type: "ai.rizom.brain.post", sourceEntityId: "post-123" },
      },
    });
  });

  it("exposes a publish-post tool that can dry-run by entity id", async () => {
    const shell = createMockShell({ domain: "brain.example.com" });
    shell.addEntities([createBlogPost()]);
    const plugin = atprotoPlugin({
      pdsEndpoint: "https://pds.example.com",
      identifier: "brain.example.com",
      brainDid: "did:web:brain.example.com",
    });
    const capabilities = await plugin.register(shell);
    const tool = capabilities.tools.find(
      (candidate) => candidate.name === "atproto_publish_post",
    );

    expect(tool).toBeDefined();
    const response = await tool?.handler(
      { entityId: "post-123", dryRun: true },
      { interfaceType: "test", userId: "test" },
    );
    expect(response).toMatchObject({
      success: true,
      data: {
        dryRun: true,
        record: { $type: "ai.rizom.brain.post", sourceEntityId: "post-123" },
      },
    });
  });
});
