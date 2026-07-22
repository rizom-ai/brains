import { describe, expect, it, mock } from "bun:test";
import { SYSTEM_CHANNELS, type BaseEntity } from "@brains/plugins";
import { createMockShell } from "@brains/test-utils";
import {
  ATPROTO_PUBLISH_FAILED,
  AtprotoPlugin,
  AtprotoProjectionRegistry,
  listCanonicalAtprotoLexicons,
  type AtprotoLexicon,
  type AtprotoPdsClientLike,
} from "../src";

async function settleTicks(count = 20): Promise<void> {
  for (let i = 0; i < count; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

async function untilTrue(condition: () => boolean): Promise<void> {
  for (let i = 0; i < 200; i += 1) {
    if (condition()) return;
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  throw new Error("condition not reached");
}

function createEntity(
  input: {
    entityType?: string;
    visibility?: "public" | "restricted";
  } = {},
): BaseEntity {
  return {
    id: "note-123",
    entityType: input.entityType ?? "note",
    content: "A public note",
    created: "2026-07-20T10:00:00.000Z",
    updated: "2026-07-20T10:00:00.000Z",
    visibility: input.visibility ?? "public",
    contentHash: "note-hash",
    metadata: { title: "Public note" },
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
          required: ["title", "createdAt"],
          properties: {
            title: { type: "string" },
            createdAt: { type: "string", format: "datetime" },
          },
        },
      },
    },
  };
}

function createRegistry(): AtprotoProjectionRegistry {
  const registry = AtprotoProjectionRegistry.createFresh();
  registry.register({
    entityType: "note",
    collection: "ai.rizom.brain.note",
    lexicon: createLexicon("ai.rizom.brain.note"),
    validate: false,
    buildRecord: async ({ entity }) => ({
      $type: "ai.rizom.brain.note",
      title: String(entity.metadata["title"]),
      createdAt: entity.created,
    }),
  });
  return registry;
}

function createClientMocks(input: { putError?: Error } = {}): {
  client: AtprotoPdsClientLike;
  createSession: ReturnType<typeof mock>;
  putRecord: ReturnType<typeof mock>;
  deleteRecord: ReturnType<typeof mock>;
} {
  const createSession = mock(async () => ({
    did: "did:plc:repo",
    handle: "brain.example.com",
    accessJwt: "access-token",
    refreshJwt: "refresh-token",
  }));
  const putRecord = mock(
    async (
      _input: Parameters<NonNullable<AtprotoPdsClientLike["putRecord"]>>[0],
    ) => {
      if (input.putError) throw input.putError;
      return { uri: "at://did:plc:repo/record", cid: "cid" };
    },
  );
  const deleteRecord = mock(async () => {});
  return {
    client: {
      createSession,
      createRecord: mock(async () => ({
        uri: "at://did:plc:repo/record",
        cid: "cid",
      })),
      putRecord,
      deleteRecord,
    },
    createSession,
    putRecord,
    deleteRecord,
  };
}

function createConfiguredPlugin(
  registry: AtprotoProjectionRegistry,
  client: AtprotoPdsClientLike,
  config: { lexiconAuthority?: boolean } = {},
): AtprotoPlugin {
  return new AtprotoPlugin(
    {
      identifier: "brain.example.com",
      appPassword: "secret",
      repoDid: "did:plc:repo",
      ...config,
    },
    {
      projectionRegistry: registry,
      createPdsClient: () => client,
    },
  );
}

describe("AT Protocol ambient publishing triggers", () => {
  it("does not publish the brain card on the plugins-registered coordination event", async () => {
    const client = createClientMocks();
    const plugin = createConfiguredPlugin(createRegistry(), client.client);
    const shell = createMockShell({ domain: "brain.example.com" });
    await plugin.register(shell);

    await shell.getMessageBus().send({
      type: SYSTEM_CHANNELS.pluginsRegistered,
      payload: {},
      sender: "test",
      broadcast: true,
    });
    await plugin.shutdown?.();

    expect(client.putRecord).not.toHaveBeenCalled();
  });

  it("upserts the brain card from identity loaded before ready", async () => {
    const client = createClientMocks();
    const plugin = createConfiguredPlugin(createRegistry(), client.client);
    const shell = createMockShell({ domain: "brain.example.com" });
    await plugin.register(shell);
    shell.getIdentity = (): ReturnType<typeof shell.getIdentity> => ({
      name: "Ready Brain",
      role: "Post-registration role",
      purpose: "Identity loaded before ready",
      values: ["presence", "coordination"],
    });
    shell.getProfile = (): ReturnType<typeof shell.getProfile> => ({
      name: "Ready Anchor",
      kind: "collective",
      description: "Loaded profile",
    });

    await plugin.ready();
    await plugin.shutdown?.();

    expect(client.putRecord).toHaveBeenCalledTimes(1);
    expect(client.putRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        repo: "did:plc:repo",
        collection: "ai.rizom.brain.card",
        rkey: "self",
        validate: false,
        record: expect.objectContaining({
          brain: expect.objectContaining({
            name: "Ready Brain",
            role: "Post-registration role",
            purpose: "Identity loaded before ready",
            values: ["presence", "coordination"],
          }),
          anchor: expect.objectContaining({
            name: "Ready Anchor",
            kind: "collective",
          }),
        }),
      }),
    );
    expect(client.putRecord).not.toHaveBeenCalledWith(
      expect.objectContaining({
        collection: "com.atproto.lexicon.schema",
      }),
    );
  });

  it("upserts every canonical lexicon schema when this repo is the authority", async () => {
    const client = createClientMocks();
    const plugin = createConfiguredPlugin(createRegistry(), client.client, {
      lexiconAuthority: true,
    });
    const shell = createMockShell({ domain: "brain.example.com" });
    await plugin.register(shell);

    await plugin.ready();
    await plugin.shutdown?.();

    const lexicons = listCanonicalAtprotoLexicons();
    expect(client.createSession).toHaveBeenCalledTimes(2);
    expect(client.putRecord).toHaveBeenCalledTimes(lexicons.length + 1);
    for (const lexicon of lexicons) {
      expect(client.putRecord).toHaveBeenCalledWith({
        repo: "did:plc:repo",
        collection: "com.atproto.lexicon.schema",
        rkey: lexicon.id,
        record: {
          $type: "com.atproto.lexicon.schema",
          ...lexicon,
        },
      });
    }
  });

  it("converges lexicon schemas under the same record keys on every ready call", async () => {
    const client = createClientMocks();
    const plugin = createConfiguredPlugin(createRegistry(), client.client, {
      lexiconAuthority: true,
    });
    const shell = createMockShell({ domain: "brain.example.com" });
    await plugin.register(shell);

    for (let index = 0; index < 2; index += 1) {
      await plugin.ready();
    }
    await plugin.shutdown?.();

    for (const lexicon of listCanonicalAtprotoLexicons()) {
      const matchingCalls = client.putRecord.mock.calls.filter(
        ([input]) =>
          input.collection === "com.atproto.lexicon.schema" &&
          input.rkey === lexicon.id,
      );
      expect(matchingCalls).toHaveLength(2);
    }
  });

  it("isolates one schema failure and continues publishing the remaining lexicons", async () => {
    const client = createClientMocks();
    const putRecord = mock(
      async (
        input: Parameters<NonNullable<AtprotoPdsClientLike["putRecord"]>>[0],
      ) => {
        if (
          input.collection === "com.atproto.lexicon.schema" &&
          input.rkey === "ai.rizom.brain.card"
        ) {
          throw new Error("schema rejected");
        }
        return { uri: "at://did:plc:repo/record", cid: "cid" };
      },
    );
    client.client.putRecord = putRecord;
    const plugin = createConfiguredPlugin(createRegistry(), client.client, {
      lexiconAuthority: true,
    });
    const shell = createMockShell({ domain: "brain.example.com" });
    const failures: unknown[] = [];
    shell.getMessageBus().subscribe(ATPROTO_PUBLISH_FAILED, async (message) => {
      failures.push(message.payload);
      return { success: true };
    });
    await plugin.register(shell);

    await plugin.ready();
    await plugin.shutdown?.();

    expect(putRecord).toHaveBeenCalledTimes(
      listCanonicalAtprotoLexicons().length + 1,
    );
    expect(putRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: "com.atproto.lexicon.schema",
        rkey: "ai.rizom.brain.topic",
      }),
    );
    expect(failures).toEqual([
      {
        operation: "upsert-record",
        entityType: "lexicon-schema",
        entityId: "ai.rizom.brain.card",
        collection: "com.atproto.lexicon.schema",
        error: "schema rejected",
      },
    ]);
  });

  it("skips the ready trigger when publishing credentials are absent", async () => {
    const createPdsClient = mock(() => createClientMocks().client);
    const plugin = new AtprotoPlugin(
      { lexiconAuthority: true },
      { projectionRegistry: createRegistry(), createPdsClient },
    );
    const shell = createMockShell({ domain: "brain.example.com" });
    await plugin.register(shell);

    await plugin.ready();
    await plugin.shutdown?.();

    expect(createPdsClient).not.toHaveBeenCalled();
  });

  it("upserts a public projected entity after publish completion", async () => {
    const client = createClientMocks();
    const plugin = createConfiguredPlugin(createRegistry(), client.client);
    const shell = createMockShell({ domain: "brain.example.com" });
    shell.addEntities([createEntity()]);
    await plugin.register(shell);

    await shell.getMessageBus().send({
      type: "publish:completed",
      payload: { entityType: "note", entityId: "note-123" },
      sender: "publish-service",
      broadcast: true,
    });
    await plugin.shutdown?.();

    expect(client.putRecord).toHaveBeenCalledTimes(1);
    expect(client.putRecord).toHaveBeenCalledWith({
      repo: "did:plc:repo",
      collection: "ai.rizom.brain.note",
      rkey: "note-123",
      validate: false,
      record: {
        $type: "ai.rizom.brain.note",
        title: "Public note",
        createdAt: "2026-07-20T10:00:00.000Z",
      },
    });
  });

  it("deletes the projected record when a public entity is deleted", async () => {
    const client = createClientMocks();
    const plugin = createConfiguredPlugin(createRegistry(), client.client);
    const shell = createMockShell({ domain: "brain.example.com" });
    await plugin.register(shell);
    const entity = createEntity();

    await shell.getMessageBus().send({
      type: "entity:deleted",
      payload: { entityType: "note", entityId: "note-123", entity },
      sender: "entity-service",
      broadcast: true,
    });
    await plugin.shutdown?.();

    expect(client.deleteRecord).toHaveBeenCalledWith({
      repo: "did:plc:repo",
      collection: "ai.rizom.brain.note",
      rkey: "note-123",
    });
    expect(client.putRecord).not.toHaveBeenCalled();
  });

  it("deletes the projected record when an entity turns non-public", async () => {
    const client = createClientMocks();
    const plugin = createConfiguredPlugin(createRegistry(), client.client);
    const shell = createMockShell({ domain: "brain.example.com" });
    const entity = createEntity({ visibility: "restricted" });
    shell.addEntities([entity]);
    await plugin.register(shell);

    await shell.getMessageBus().send({
      type: "entity:updated",
      payload: { entityType: "note", entityId: "note-123", entity },
      sender: "entity-service",
      broadcast: true,
    });
    await plugin.shutdown?.();

    expect(client.deleteRecord).toHaveBeenCalledWith({
      repo: "did:plc:repo",
      collection: "ai.rizom.brain.note",
      rkey: "note-123",
    });
    expect(client.putRecord).not.toHaveBeenCalled();
  });

  it("ignores entity types without a registered projection", async () => {
    const client = createClientMocks();
    const plugin = createConfiguredPlugin(createRegistry(), client.client);
    const shell = createMockShell({ domain: "brain.example.com" });
    shell.addEntities([createEntity({ entityType: "agent" })]);
    await plugin.register(shell);

    await shell.getMessageBus().send({
      type: "publish:completed",
      payload: { entityType: "agent", entityId: "note-123" },
      sender: "publish-service",
      broadcast: true,
    });
    await plugin.shutdown?.();

    expect(client.createSession).not.toHaveBeenCalled();
    expect(client.putRecord).not.toHaveBeenCalled();
    expect(client.deleteRecord).not.toHaveBeenCalled();
  });

  it("serializes same-entity writes so a delete cannot lose to an in-flight upsert", async () => {
    const calls: string[] = [];
    let releaseUpsert = (): void => {};
    const gate = new Promise<void>((resolve) => {
      releaseUpsert = resolve;
    });
    const createSession = mock(async () => ({
      did: "did:plc:repo",
      handle: "brain.example.com",
      accessJwt: "access-token",
      refreshJwt: "refresh-token",
    }));
    const putRecord = mock(async () => {
      calls.push("put:start");
      await gate;
      calls.push("put:end");
      return { uri: "at://did:plc:repo/record", cid: "cid" };
    });
    const deleteRecord = mock(async () => {
      calls.push("delete");
    });
    const client: AtprotoPdsClientLike = {
      createSession,
      createRecord: mock(async () => ({
        uri: "at://did:plc:repo/record",
        cid: "cid",
      })),
      putRecord,
      deleteRecord,
    };
    const plugin = createConfiguredPlugin(createRegistry(), client);
    const shell = createMockShell({ domain: "brain.example.com" });
    const entity = createEntity();
    shell.addEntities([entity]);
    await plugin.register(shell);

    await shell.getMessageBus().send({
      type: "publish:completed",
      payload: { entityType: "note", entityId: "note-123" },
      sender: "publish-service",
      broadcast: true,
    });
    await untilTrue(() => calls.includes("put:start"));

    await shell.getMessageBus().send({
      type: "entity:deleted",
      payload: { entityType: "note", entityId: "note-123", entity },
      sender: "entity-service",
      broadcast: true,
    });
    await settleTicks();
    expect(calls).toEqual(["put:start"]);

    releaseUpsert();
    await plugin.shutdown?.();

    expect(calls).toEqual(["put:start", "put:end", "delete"]);
    expect(deleteRecord).toHaveBeenCalledTimes(1);
  });

  it("still publishes distinct entities concurrently", async () => {
    let releaseUpserts = (): void => {};
    const gate = new Promise<void>((resolve) => {
      releaseUpserts = resolve;
    });
    const putRecord = mock(async () => {
      await gate;
      return { uri: "at://did:plc:repo/record", cid: "cid" };
    });
    const client: AtprotoPdsClientLike = {
      createSession: mock(async () => ({
        did: "did:plc:repo",
        handle: "brain.example.com",
        accessJwt: "access-token",
        refreshJwt: "refresh-token",
      })),
      createRecord: mock(async () => ({
        uri: "at://did:plc:repo/record",
        cid: "cid",
      })),
      putRecord,
      deleteRecord: mock(async () => {}),
    };
    const plugin = createConfiguredPlugin(createRegistry(), client);
    const shell = createMockShell({ domain: "brain.example.com" });
    shell.addEntities([createEntity(), { ...createEntity(), id: "note-456" }]);
    await plugin.register(shell);

    for (const entityId of ["note-123", "note-456"]) {
      await shell.getMessageBus().send({
        type: "publish:completed",
        payload: { entityType: "note", entityId },
        sender: "publish-service",
        broadcast: true,
      });
    }
    // Both upserts must be in flight while the gate is closed: per-entity
    // serialization must not degrade into one global write queue.
    await untilTrue(() => putRecord.mock.calls.length === 2);

    releaseUpserts();
    await plugin.shutdown?.();
    expect(putRecord).toHaveBeenCalledTimes(2);
  });

  it("reports PDS failures without failing the source publish event", async () => {
    const client = createClientMocks({
      putError: new Error("PDS unavailable"),
    });
    const plugin = createConfiguredPlugin(createRegistry(), client.client);
    const shell = createMockShell({ domain: "brain.example.com" });
    shell.addEntities([createEntity()]);
    const failures: unknown[] = [];
    shell.getMessageBus().subscribe(ATPROTO_PUBLISH_FAILED, async (message) => {
      failures.push(message.payload);
      return { success: true };
    });
    await plugin.register(shell);

    const response = await shell.getMessageBus().send({
      type: "publish:completed",
      payload: { entityType: "note", entityId: "note-123" },
      sender: "publish-service",
      broadcast: true,
    });
    await plugin.shutdown?.();

    expect(response).toEqual({ success: true });
    expect(failures).toEqual([
      {
        operation: "upsert-record",
        entityType: "note",
        entityId: "note-123",
        collection: "ai.rizom.brain.note",
        error: "PDS unavailable",
      },
    ]);
  });
});
