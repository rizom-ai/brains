import { createMockShell } from "@brains/plugins/test";
import { beforeEach, describe, expect, it, mock } from "bun:test";
import type { BaseEntity } from "@brains/plugins";
import { caughtError } from "@brains/test-utils";
import {
  AtprotoProjectionRegistry,
  type AtprotoLexicon,
  type AtprotoPdsClientLike,
} from "../src";
import { instantiate, publisherFor, type MockShell } from "./helpers/install";

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

/**
 * Stand-in for a canonical brain lexicon. It declares the same envelope the
 * real ones do, because record schemas reject fields their lexicon does not
 * declare — a stub narrower than what the projections under test emit would
 * fail for a reason unrelated to the behaviour being tested.
 */
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
            body: { type: "string" },
            format: { type: "string" },
            url: { type: "string", format: "uri" },
            topics: { type: "array", items: { type: "string" } },
            brainDid: { type: "string", format: "did" },
            anchorDid: { type: "string", format: "did" },
            sourceEntityType: { type: "string" },
            sourceEntityId: { type: "string" },
            createdAt: { type: "string", format: "datetime" },
            updatedAt: { type: "string", format: "datetime" },
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

function createShell(
  post: BaseEntity = createPost(),
  extraEntities: BaseEntity[] = [],
): MockShell {
  const shell = createMockShell({ domain: "brain.example.com" });
  shell.addEntities([post, ...extraEntities]);
  return shell;
}

function sessionFor(did: string): AtprotoPdsClientLike["createSession"] {
  return mock(async () => ({
    did,
    handle: "brain.example.com",
    accessJwt: "access-token",
    refreshJwt: "refresh-token",
  }));
}

const invalidTitleLexicon: AtprotoLexicon = {
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
};

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
    const publisher = publisherFor(
      createShell(),
      {
        pdsEndpoint: "https://pds.example.com",
        identifier: "brain.example.com",
        appPassword: "secret",
        repoDid: "did:plc:repo",
      },
      {
        createPdsClient: (): AtprotoPdsClientLike => ({
          createSession: sessionFor("did:plc:repo"),
          createRecord,
        }),
      },
    );

    const result = await publisher.publishPost({
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
    const publisher = publisherFor(
      createShell(),
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
          createSession: sessionFor("did:plc:repo"),
          createRecord,
        }),
      },
    );

    const result = await publisher.publishPost({
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
    const publisher = publisherFor(
      createShell(createPost(), [link]),
      {
        pdsEndpoint: "https://pds.example.com",
        identifier: "brain.example.com",
        appPassword: "secret",
      },
      {
        projectionRegistry: registry,
        createPdsClient: (): AtprotoPdsClientLike => ({
          createSession: sessionFor("did:plc:session-repo"),
          createRecord: mock(async () => ({ uri: "unused", cid: "unused" })),
          putRecord,
        }),
      },
    );

    const result = await publisher.publishEntity({
      entityType: "link",
      entityId: "link-123",
    });

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
    const publisher = publisherFor(
      createShell(),
      {
        pdsEndpoint: "https://pds.example.com",
        identifier: "brain.example.com",
        appPassword: "secret",
      },
      {
        projectionRegistry: registry,
        createPdsClient: (): AtprotoPdsClientLike => ({
          createSession: sessionFor("did:plc:session-repo"),
          createRecord: mock(async () => ({ uri: "unused", cid: "unused" })),
          putRecord,
        }),
      },
    );

    const result = await publisher.publishPost({ entityId: "post-123" });

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

  it("hands a projection the brain's reads and refuses writes on its behalf", async () => {
    // The service owns no entity types. A projection declared on an entity
    // is bound to its own package's writes by the runtime; one registered
    // straight onto the registry gets reads and a clear refusal, not a way
    // into another package's records.
    const registry = AtprotoProjectionRegistry.createFresh();
    let writeError: string | undefined;
    registry.register({
      entityType: "post",
      collection: "ai.rizom.brain.post",
      lexicon: createLexicon("ai.rizom.brain.post"),
      validate: false,
      buildRecord: async ({ entity, context }) => {
        const found = await context.entityService.getEntity({
          entityType: "post",
          id: entity.id,
        });
        try {
          await context.entityService.updateEntity({ entity });
        } catch (error) {
          writeError = caughtError(error).message;
        }
        return {
          $type: "ai.rizom.brain.post",
          title: String(found?.metadata["title"]),
          createdAt: entity.created,
        };
      },
    });
    const publisher = publisherFor(
      createShell(),
      { pdsEndpoint: "https://pds.example.com" },
      { projectionRegistry: registry },
    );

    const result = await publisher.publishPost({
      entityId: "post-123",
      dryRun: true,
    });

    expect(result.record.title).toBe("Distributed Brains");
    expect(writeError).toContain("owns no entity types");
  });

  it("rejects locally invalid projected records during dry-runs", async () => {
    const registry = AtprotoProjectionRegistry.createFresh();
    registry.register({
      entityType: "post",
      collection: "ai.rizom.brain.post",
      lexicon: invalidTitleLexicon,
      validate: false,
      buildRecord: async () => ({
        $type: "ai.rizom.brain.post",
        title: 123,
        createdAt: "2026-05-28T10:00:00.000Z",
      }),
    });
    const publisher = publisherFor(
      createShell(),
      { pdsEndpoint: "https://pds.example.com" },
      { projectionRegistry: registry },
    );

    try {
      await publisher.publishPost({ entityId: "post-123", dryRun: true });
      throw new Error("Expected invalid dry-run record publish to fail");
    } catch (error) {
      expect(caughtError(error).message).toContain(
        "Invalid AT Protocol record field title: expected string",
      );
    }
  });

  it("rejects locally invalid projected records before writing to the PDS", async () => {
    const registry = AtprotoProjectionRegistry.createFresh();
    registry.register({
      entityType: "post",
      collection: "ai.rizom.brain.post",
      lexicon: invalidTitleLexicon,
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
    const publisher = publisherFor(
      createShell(),
      {
        pdsEndpoint: "https://pds.example.com",
        identifier: "brain.example.com",
        appPassword: "secret",
      },
      {
        projectionRegistry: registry,
        createPdsClient: (): AtprotoPdsClientLike => ({
          createSession: sessionFor("did:plc:session-repo"),
          createRecord,
        }),
      },
    );

    try {
      await publisher.publishPost({ entityId: "post-123" });
      throw new Error("Expected invalid record publish to fail");
    } catch (error) {
      expect(caughtError(error).message).toContain(
        "Invalid AT Protocol record field title: expected string",
      );
    }
    expect(createRecord).not.toHaveBeenCalled();
  });

  it("publishes a post record to the configured PDS repo", async () => {
    const createSession = sessionFor("did:plc:session-repo");
    const putRecord = mock(async () => ({
      uri: "at://repo/post",
      cid: "cid",
    }));
    const publisher = publisherFor(
      createShell(),
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

    const result = await publisher.publishPost({ entityId: "post-123" });

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
    const publisher = publisherFor(
      createShell(createPost({ visibility: "restricted" })),
      {
        pdsEndpoint: "https://pds.example.com",
        identifier: "brain.example.com",
        appPassword: "secret",
      },
    );

    try {
      await publisher.publishPost({ entityId: "post-123", dryRun: true });
      throw new Error("Expected private post publish to fail");
    } catch (error) {
      expect(caughtError(error).message).toContain(
        "Cannot publish non-public post",
      );
    }
  });

  it("does not expose publish-entity or publish-post as agent tools", async () => {
    const shell = createShell();
    const config = {
      pdsEndpoint: "https://pds.example.com",
      identifier: "brain.example.com",
      brainDid: "did:web:brain.example.com",
    };
    const capabilities = await instantiate(config).register(shell);

    expect(capabilities.tools).toEqual([]);
    const publisher = publisherFor(shell, config);
    expect(
      await publisher.publishEntity({
        entityType: "post",
        entityId: "post-123",
        dryRun: true,
      }),
    ).toMatchObject({
      dryRun: true,
      record: { $type: "ai.rizom.brain.post", sourceEntityId: "post-123" },
    });
    expect(
      await publisher.publishPost({ slug: "distributed-brains", dryRun: true }),
    ).toMatchObject({
      dryRun: true,
      record: { $type: "ai.rizom.brain.post", sourceEntityId: "post-123" },
    });
  });
});
