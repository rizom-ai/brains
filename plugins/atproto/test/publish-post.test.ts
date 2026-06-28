import { beforeEach, describe, expect, it, mock } from "bun:test";
import { createServicePluginContext } from "@brains/plugins";
import type { BaseEntity, ServicePluginContext } from "@brains/plugins";
import { createMockShell } from "@brains/test-utils";
import {
  AtprotoPlugin,
  AtprotoProjectionRegistry,
  atprotoPlugin,
  type AtprotoLexicon,
  type AtprotoPdsClientLike,
} from "../src";

function createPost(
  input: { visibility?: "public" | "restricted" } = {},
): BaseEntity {
  return {
    id: "post-123",
    entityType: "post",
    content: "Brains should publish projections, not duplicate content models.",
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
  };
}

function createLexicon(id: string): AtprotoLexicon {
  return {
    lexicon: 1,
    id,
    defs: {
      main: {
        type: "record",
        key: "tid",
        record: {
          type: "object",
          properties: {
            title: { type: "string" },
            createdAt: { type: "string", format: "datetime" },
          },
        },
      },
    },
  };
}

function registerTestPostProjection(): void {
  AtprotoProjectionRegistry.getInstance().register({
    entityType: "post",
    collection: "ai.rizom.brain.post",
    lexicon: createLexicon("ai.rizom.brain.post"),
    validate: false,
    buildRecord: async ({ entity, config, topics }) => ({
      $type: "ai.rizom.brain.post",
      title: "Distributed Brains",
      body: entity.content,
      format: "text/markdown",
      ...(config.brainDid && { brainDid: config.brainDid }),
      ...(config.anchorDid && { anchorDid: config.anchorDid }),
      ...(topics && topics.length > 0 && { topics }),
      sourceEntityType: "post",
      sourceEntityId: entity.id,
      createdAt: entity.created,
    }),
  });
}

function createContext(
  post: BaseEntity = createPost(),
  extraEntities: BaseEntity[] = [],
): ServicePluginContext {
  const shell = createMockShell({ domain: "brain.example.com" });
  shell.addEntities([post, ...extraEntities]);
  return createServicePluginContext(shell, "atproto");
}

describe("AT Protocol post publishing", () => {
  beforeEach(() => {
    AtprotoProjectionRegistry.resetInstance();
    registerTestPostProjection();
  });

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

  it("publishes any public entity with a registered ATProto projection", async () => {
    const registry = AtprotoProjectionRegistry.createFresh();
    const buildRecord = mock(async ({ entity }: { entity: BaseEntity }) => ({
      $type: "ai.rizom.brain.link",
      title: "Example Link",
      url: "https://example.com",
      createdAt: entity.created,
      sourceEntityType: "link",
      sourceEntityId: entity.id,
    }));
    registry.register({
      entityType: "link",
      collection: "ai.rizom.brain.link",
      lexicon: createLexicon("ai.rizom.brain.link"),
      validate: false,
      buildRecord,
    });
    const putRecord = mock(async () => ({
      uri: "at://repo/link",
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
          createRecord: mock(async () => ({ uri: "unused", cid: "unused" })),
          putRecord,
        }),
      },
    );
    const link: BaseEntity = {
      id: "link-123",
      entityType: "link",
      content: "A useful link",
      created: "2026-05-28T10:00:00.000Z",
      updated: "2026-05-28T10:00:00.000Z",
      visibility: "public",
      contentHash: "hash",
      metadata: { title: "Example Link" },
    };

    const result = await plugin.publishEntity(
      createContext(createPost(), [link]),
      {
        entityType: "link",
        entityId: "link-123",
      },
    );

    expect(result.uri).toBe("at://repo/link");
    expect(buildRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        entity: expect.objectContaining({ id: "link-123" }),
      }),
    );
    expect(putRecord).toHaveBeenCalledWith({
      repo: "did:plc:session-repo",
      collection: "ai.rizom.brain.link",
      rkey: "link-123",
      validate: false,
      record: result.record,
    });
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
    const onPublished = mock(async () => {});
    registry.register({
      entityType: "post",
      collection: "ai.example.customPost",
      lexicon: createLexicon("ai.example.customPost"),
      validate: false,
      buildRecord,
      onPublished,
    });
    const putRecord = mock(async () => ({
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
          createRecord: mock(async () => ({ uri: "unused", cid: "unused" })),
          putRecord,
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
    expect(putRecord).toHaveBeenCalledWith({
      repo: "did:plc:session-repo",
      collection: "ai.example.customPost",
      rkey: "post-123",
      validate: false,
      record: result.record,
    });
    expect(onPublished).toHaveBeenCalledWith(
      expect.objectContaining({
        entity: expect.objectContaining({ id: "post-123" }),
        record: result.record,
        uri: "at://repo/custom-post",
        cid: "cid",
      }),
    );
  });

  it("rejects locally invalid projected records during dry-runs", async () => {
    const registry = AtprotoProjectionRegistry.createFresh();
    registry.register({
      entityType: "post",
      collection: "ai.rizom.brain.post",
      lexicon: {
        lexicon: 1,
        id: "ai.rizom.brain.post",
        defs: {
          main: {
            type: "record",
            key: "tid",
            record: {
              type: "object",
              required: ["title", "createdAt"],
              properties: {
                title: { type: "string" },
                createdAt: { type: "string", format: "datetime" },
              },
            },
          },
        },
      },
      validate: false,
      buildRecord: async () => ({
        $type: "ai.rizom.brain.post",
        title: 123,
        createdAt: "2026-05-28T10:00:00.000Z",
      }),
    });
    const plugin = new AtprotoPlugin(
      { pdsEndpoint: "https://pds.example.com" },
      { projectionRegistry: registry },
    );

    try {
      await plugin.publishPost(createContext(), {
        entityId: "post-123",
        dryRun: true,
      });
      throw new Error("Expected invalid dry-run record publish to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toContain(
        "Invalid AT Protocol record field title: expected string",
      );
    }
  });

  it("rejects locally invalid projected records before writing to the PDS", async () => {
    const registry = AtprotoProjectionRegistry.createFresh();
    registry.register({
      entityType: "post",
      collection: "ai.rizom.brain.post",
      lexicon: {
        lexicon: 1,
        id: "ai.rizom.brain.post",
        defs: {
          main: {
            type: "record",
            key: "tid",
            record: {
              type: "object",
              required: ["title", "createdAt"],
              properties: {
                title: { type: "string" },
                createdAt: { type: "string", format: "datetime" },
              },
            },
          },
        },
      },
      validate: false,
      buildRecord: async () => ({
        $type: "ai.rizom.brain.post",
        title: 123,
        createdAt: "2026-05-28T10:00:00.000Z",
      }),
    });
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

    try {
      await plugin.publishPost(createContext(), { entityId: "post-123" });
      throw new Error("Expected invalid record publish to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toContain(
        "Invalid AT Protocol record field title: expected string",
      );
    }
    expect(createRecord).not.toHaveBeenCalled();
  });

  it("publishes a post record to the configured PDS repo", async () => {
    const createSession = mock(async () => ({
      did: "did:plc:session-repo",
      handle: "brain.example.com",
      accessJwt: "access-token",
      refreshJwt: "refresh-token",
    }));
    const putRecord = mock(async () => ({
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
          createRecord: mock(async () => ({ uri: "unused", cid: "unused" })),
          putRecord,
        }),
      },
    );

    const result = await plugin.publishPost(createContext(), {
      entityId: "post-123",
    });

    expect(result.dryRun).toBe(false);
    expect(result.repo).toBe("did:plc:session-repo");
    expect(result.uri).toBe("at://repo/post");
    expect(putRecord).toHaveBeenCalledWith({
      repo: "did:plc:session-repo",
      collection: "ai.rizom.brain.post",
      rkey: "post-123",
      validate: false,
      record: result.record,
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
        createContext(createPost({ visibility: "restricted" })),
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

  it("does not expose publish-entity as an agent tool", async () => {
    const shell = createMockShell({ domain: "brain.example.com" });
    shell.addEntities([createPost()]);
    const plugin = atprotoPlugin({
      pdsEndpoint: "https://pds.example.com",
      identifier: "brain.example.com",
      brainDid: "did:web:brain.example.com",
    });
    const capabilities = await plugin.register(shell);

    expect(capabilities.tools).toEqual([]);
    const result = await plugin.publishEntity(createContext(), {
      entityType: "post",
      entityId: "post-123",
      dryRun: true,
    });
    expect(result).toMatchObject({
      dryRun: true,
      record: { $type: "ai.rizom.brain.post", sourceEntityId: "post-123" },
    });
  });

  it("does not expose publish-post as an agent tool", async () => {
    const shell = createMockShell({ domain: "brain.example.com" });
    shell.addEntities([createPost()]);
    const plugin = atprotoPlugin({
      pdsEndpoint: "https://pds.example.com",
      identifier: "brain.example.com",
      brainDid: "did:web:brain.example.com",
    });
    const capabilities = await plugin.register(shell);

    expect(capabilities.tools).toEqual([]);
    const result = await plugin.publishPost(createContext(), {
      slug: "distributed-brains",
      dryRun: true,
    });
    expect(result).toMatchObject({
      dryRun: true,
      record: { $type: "ai.rizom.brain.post", sourceEntityId: "post-123" },
    });
  });

  it("keeps publish-post available as an internal plugin method", async () => {
    const shell = createMockShell({ domain: "brain.example.com" });
    shell.addEntities([createPost()]);
    const plugin = atprotoPlugin({
      pdsEndpoint: "https://pds.example.com",
      identifier: "brain.example.com",
      brainDid: "did:web:brain.example.com",
    });
    await plugin.register(shell);

    const result = await plugin.publishPost(createContext(), {
      entityId: "post-123",
      dryRun: true,
    });
    expect(result).toMatchObject({
      dryRun: true,
      record: { $type: "ai.rizom.brain.post", sourceEntityId: "post-123" },
    });
  });
});
