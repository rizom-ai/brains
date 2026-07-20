import { describe, expect, it, mock } from "bun:test";
import type { BaseEntity } from "@brains/plugins";
import { createMockShell } from "@brains/test-utils";
import {
  ATPROTO_PUBLISH_FAILED,
  AtprotoPlugin,
  AtprotoProjectionRegistry,
  type AtprotoLexicon,
  type AtprotoPdsClientLike,
} from "../src";

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
  const putRecord = mock(async () => {
    if (input.putError) throw input.putError;
    return { uri: "at://did:plc:repo/record", cid: "cid" };
  });
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
): AtprotoPlugin {
  return new AtprotoPlugin(
    {
      identifier: "brain.example.com",
      appPassword: "secret",
      repoDid: "did:plc:repo",
    },
    {
      projectionRegistry: registry,
      createPdsClient: () => client,
    },
  );
}

describe("AT Protocol ambient publishing triggers", () => {
  it("upserts the brain card when plugins are ready", async () => {
    const client = createClientMocks();
    const plugin = createConfiguredPlugin(createRegistry(), client.client);
    const shell = createMockShell({ domain: "brain.example.com" });
    await plugin.register(shell);

    await shell.getMessageBus().send({
      type: "system:plugins:ready",
      payload: {},
      sender: "test",
      broadcast: true,
    });
    await plugin.shutdown?.();

    expect(client.putRecord).toHaveBeenCalledTimes(1);
    expect(client.putRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        repo: "did:plc:repo",
        collection: "ai.rizom.brain.card",
        rkey: "self",
        validate: false,
      }),
    );
  });

  it("skips the ready trigger when publishing credentials are absent", async () => {
    const createPdsClient = mock(() => createClientMocks().client);
    const plugin = new AtprotoPlugin(
      {},
      { projectionRegistry: createRegistry(), createPdsClient },
    );
    const shell = createMockShell({ domain: "brain.example.com" });
    await plugin.register(shell);

    await shell.getMessageBus().send({
      type: "system:plugins:ready",
      payload: {},
      sender: "test",
      broadcast: true,
    });
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
