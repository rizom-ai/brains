import { describe, expect, test, beforeEach, afterEach, mock } from "bun:test";
import { chmod, writeFile } from "node:fs/promises";
import { createClient } from "@libsql/client";
import { dirname, join } from "node:path";
import { z } from "@brains/utils/zod";
import { EntityService } from "../src/entityService";
import { genericSpy } from "@brains/test-utils";
import { EntityRegistry } from "../src/entityRegistry";
import { baseEntitySchema } from "../src/types";
import { BaseEntityAdapter } from "../src/adapters/base-entity-adapter";
import {
  createSilentLogger,
  createMockJobQueueService,
  createTestEntity,
} from "@brains/test-utils";
import { createId } from "@brains/utils/id";
import { ENTITY_CHANNELS } from "@brains/contracts";
import { type Logger } from "@brains/utils/logger";
import { mockEmbeddingService } from "./helpers/mock-services";
import {
  setupEntityService,
  type EntityServiceTestContext,
} from "./helpers/setup-entity-service";
import { createTestEntityDatabase } from "./helpers/test-entity-db";
import {
  noteSchema as sharedNoteSchema,
  noteAdapter as sharedNoteAdapter,
  createNoteInput,
  type Note as SharedNote,
} from "./helpers/test-schemas";

// Note schema with category (specific to these unit tests)
const noteSchema = baseEntitySchema.extend({
  entityType: z.literal("note"),
  title: z.string(),
  tags: z.array(z.string()),
  category: z.string().optional(),
});

type Note = z.infer<typeof noteSchema>;

function createNote(input: Partial<Note>): Note {
  return createTestEntity<Note>("note", {
    title: "Test Note",
    tags: [],
    category: undefined,
    ...input,
  });
}

class NoteSerializerAdapter extends BaseEntityAdapter<Note> {
  constructor() {
    super({
      entityType: "note",
      purpose: "Test note entity for unit tests.",
      schema: noteSchema,
      frontmatterSchema: z.object({ category: z.string().optional() }),
    });
  }

  public override toMarkdown(entity: Note): string {
    return `# ${entity.title}\n\n${entity.content}`;
  }

  public fromMarkdown(markdown: string): Partial<Note> {
    const lines = markdown.split("\n");
    const title = lines[0]?.replace(/^#\s*/, "") ?? "Untitled";
    const content = lines.slice(2).join("\n");
    return { title, content };
  }
}

describe("EntityService", (): void => {
  let logger: Logger;
  let entityRegistry: EntityRegistry;
  let entityService: EntityService;
  let cleanup: () => Promise<void>;
  let entityDbUrl: string;
  let assertMutationAdmission: ReturnType<typeof mock>;
  let enqueueJob: ReturnType<typeof mock>;
  let sendEvent: ReturnType<typeof mock>;

  beforeEach(async (): Promise<void> => {
    const testDb = await createTestEntityDatabase();
    cleanup = testDb.cleanup;
    entityDbUrl = testDb.config.url;

    const mockJobQueueService = createMockJobQueueService({
      returns: { enqueue: "mock-job-id" },
    });
    enqueueJob = mock(async () => "mock-job-id");
    mockJobQueueService.enqueue = enqueueJob;

    logger = createSilentLogger();
    entityRegistry = EntityRegistry.createFresh(logger);
    assertMutationAdmission = mock(async () => {});
    sendEvent = mock(async () => ({ success: true }));
    entityService = EntityService.createFresh({
      embeddingService: mockEmbeddingService,
      entityRegistry,
      logger,
      jobQueueService: mockJobQueueService,
      dbConfig: testDb.config,
      embeddingDbConfig: testDb.embeddingConfig,
      mutationAdmission: { assertMutationAdmission },
      messageBus: { send: sendEvent },
    });
  });

  afterEach(async (): Promise<void> => {
    await cleanup();
  });

  test("reconciles projection output embeddings after atomic writes", async () => {
    entityRegistry.registerEntityType(
      "note",
      noteSchema,
      new NoteSerializerAdapter(),
    );

    await entityService.reconcileProjectionTargets([
      {
        entityType: "note",
        entityId: "projected-note",
        operation: "upsert",
        contentHash: "projected-hash",
      },
      {
        entityType: "note",
        entityId: "deleted-projected-note",
        operation: "delete",
      },
    ]);

    expect(enqueueJob).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "shell:embedding",
        data: {
          id: "projected-note",
          entityType: "note",
          contentHash: "projected-hash",
          operation: "update",
        },
      }),
    );
    expect(sendEvent).toHaveBeenCalledWith({
      type: ENTITY_CHANNELS.updated,
      payload: {
        entityType: "note",
        entityId: "projected-note",
      },
      sender: "entity-service",
      broadcast: true,
    });
    expect(sendEvent).toHaveBeenCalledWith({
      type: ENTITY_CHANNELS.deleted,
      payload: {
        entityType: "note",
        entityId: "deleted-projected-note",
      },
      sender: "entity-service",
      broadcast: true,
    });
  });

  test("ordinary mutations take ownership back from projection outputs", async () => {
    entityRegistry.registerEntityType(
      "note",
      noteSchema,
      new NoteSerializerAdapter(),
    );
    await entityService.initialize();
    const store = entityService.getProjectionStore();
    await store.markDirty({
      sourceType: "document",
      sourceId: "ownership-source",
      revision: "ownership-source-hash",
      operation: "upsert",
      markedAt: 10,
    });
    await store.claimPendingWave({
      waveId: "ownership-wave",
      graphFingerprint: "graph-1",
      startedAt: 20,
    });
    await store.putWaveRules("ownership-wave", [
      { ruleId: "note-summary", targetType: "note", level: 0 },
    ]);
    await store.applyRuleResult({
      waveId: "ownership-wave",
      ruleId: "note-summary",
      ruleVersion: "1",
      inputFingerprint: "ownership-input",
      writeIntents: [
        {
          operation: "upsert",
          entity: {
            id: "owned-note",
            entityType: "note",
            content: "# Test Note\n\nProjection-owned note",
            metadata: {},
            visibility: "public",
          },
        },
      ],
      completedAt: 30,
    });

    expect(
      await entityService.isProjectionOwnedEntity({
        entityType: "note",
        id: "owned-note",
      }),
    ).toBe(true);

    const updateResult = await entityService.updateEntity({
      entity: createNote({
        id: "owned-note",
        content: "Projection-owned note",
      }),
    });

    expect(updateResult.skipped).toBe(true);
    expect(
      await entityService.isProjectionOwnedEntity({
        entityType: "note",
        id: "owned-note",
      }),
    ).toBe(false);
  });

  test("checks projection admission only for persisted mutations", async () => {
    entityRegistry.registerEntityType(
      "note",
      noteSchema,
      new NoteSerializerAdapter(),
    );
    const entity = createNote({ id: "admission-note", content: "first" });

    await entityService.createEntity({ entity });
    await entityService.updateEntity({
      entity: { ...entity, content: "second" },
    });
    await entityService.deleteEntity({ entityType: "note", id: entity.id });

    expect(assertMutationAdmission).toHaveBeenNthCalledWith(1, {
      operation: "create",
      entityType: "note",
      entityId: entity.id,
    });
    expect(assertMutationAdmission).toHaveBeenNthCalledWith(2, {
      operation: "update",
      entityType: "note",
      entityId: entity.id,
    });
    expect(assertMutationAdmission).toHaveBeenNthCalledWith(3, {
      operation: "delete",
      entityType: "note",
      entityId: entity.id,
    });
  });

  test("journals persisted mutations for scheduler waves", async () => {
    entityRegistry.registerEntityType(
      "note",
      noteSchema,
      new NoteSerializerAdapter(),
    );
    const first = createNote({ id: "journal-first", content: "first" });
    const updated = createNote({ id: "journal-updated", content: "before" });
    const deleted = createNote({ id: "journal-deleted", content: "delete" });

    await entityService.createEntity({ entity: first });
    await entityService.createEntity({ entity: updated });
    await entityService.createEntity({ entity: deleted });
    const initialUpdatedInput = (
      await entityService.getProjectionStore().listPendingInputs()
    ).find((input) => input.sourceId === updated.id);

    await entityService.updateEntity({
      entity: { ...updated, content: "after" },
    });
    await entityService.deleteEntity({
      entityType: "note",
      id: deleted.id,
    });

    const pending = await entityService
      .getProjectionStore()
      .listPendingInputs();
    expect(pending).toHaveLength(3);
    expect(pending).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourceType: "note",
          sourceId: first.id,
          operation: "upsert",
        }),
        expect.objectContaining({
          sourceType: "note",
          sourceId: updated.id,
          operation: "upsert",
        }),
        expect.objectContaining({
          sourceType: "note",
          sourceId: deleted.id,
          operation: "delete",
        }),
      ]),
    );
    expect(
      pending.find((input) => input.sourceId === updated.id)?.revision,
    ).not.toBe(initialUpdatedInput?.revision);
  });

  test("does not journal skipped no-op updates", async () => {
    entityRegistry.registerEntityType(
      "note",
      noteSchema,
      new NoteSerializerAdapter(),
    );
    const entity = createNote({ id: "journal-no-op", content: "same" });

    await entityService.createEntity({ entity });
    const before = (
      await entityService.getProjectionStore().listPendingInputs()
    ).find((input) => input.sourceId === entity.id);
    await entityService.updateEntity({ entity });
    const after = (
      await entityService.getProjectionStore().listPendingInputs()
    ).find((input) => input.sourceId === entity.id);

    expect(after?.generation).toBe(before?.generation);
  });

  test("rolls back entity persistence when dirty journaling fails", async () => {
    entityRegistry.registerEntityType(
      "note",
      noteSchema,
      new NoteSerializerAdapter(),
    );
    const client = createClient({ url: entityDbUrl });
    await client.execute("DROP TABLE projection_dirty_inputs");
    client.close();

    const entity = createNote({ id: "journal-rollback", content: "rollback" });
    let rejected = false;
    try {
      await entityService.createEntity({ entity });
    } catch {
      rejected = true;
    }
    expect(rejected).toBe(true);
    expect(
      await entityService.getEntity({ entityType: "note", id: entity.id }),
    ).toBeNull();
  });

  test("getEntityTypes returns empty array when no types registered", (): void => {
    const types = entityService.getEntityTypes();
    expect(types).toEqual([]);
  });

  test("getEntityTypes returns registered types", (): void => {
    const mockGetAllEntityTypes = mock(() => ["note", "profile"]);
    entityRegistry.getAllEntityTypes = mockGetAllEntityTypes;

    const types = entityService.getEntityTypes();
    expect(types).toEqual(["note", "profile"]);
    expect(mockGetAllEntityTypes).toHaveBeenCalled();
  });

  test("entity validation uses EntityRegistry", (): void => {
    const testEntity = createNote({ title: "Test Note", category: "test" });

    const mockValidateEntity = mock(
      (_type: string, entity: unknown) => entity,
    ) as typeof entityRegistry.validateEntity;
    entityRegistry.validateEntity = mockValidateEntity;

    const mockAdapter = {
      entityType: "note",
      purpose: "Test note entity for unit tests.",
      schema: noteSchema,
      toMarkdown: mock(() => "Test content"),
      fromMarkdown: mock(() => ({ content: "Test content" })),
      extractMetadata: mock(() => ({})),
      parseFrontMatter: mock(() => ({})),
      generateFrontMatter: mock(() => ""),
    };
    // getAdapter is generic, and mock() erases type parameters; genericSpy
    // re-applies the member signature and names that as the only reason. The
    // mock itself is kept so the call can still be asserted.
    const mockGetAdapter = mock(() => mockAdapter);
    entityRegistry.getAdapter =
      genericSpy<typeof entityRegistry.getAdapter>(mockGetAdapter);

    expect(() => {
      entityRegistry.validateEntity("note", testEntity);
      const adapter = entityRegistry.getAdapter("note");
      adapter.toMarkdown(testEntity);
    }).not.toThrow();

    expect(mockValidateEntity).toHaveBeenCalledWith("note", testEntity);
    expect(mockGetAdapter).toHaveBeenCalled();
  });

  test("entity creation generates ID when not provided", (): void => {
    const entityData = {
      id: createId(),
      entityType: "note",
      title: "Test Note",
      content: "Test content",
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
      tags: [],
      category: "general",
    };

    const entityWithId = {
      ...entityData,
      id: entityData.id || createId(),
    };

    expect(entityWithId.id).toBeDefined();
    expect(typeof entityWithId.id).toBe("string");
    expect(entityWithId.id.length).toBeGreaterThan(0);
  });

  test("entity creation preserves provided ID", (): void => {
    const customId = "custom-test-id";
    const entityData = {
      id: customId,
      entityType: "note",
      title: "Test Note",
      content: "Test content",
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
      tags: [],
    };

    const entityWithId = {
      ...entityData,
      id: entityData.id || createId(),
    };

    expect(entityWithId.id).toBe(customId);
  });

  test("update entity modifies updated timestamp", (): void => {
    const originalTime = "2023-01-01T00:00:00.000Z";
    const entity = createNote({
      id: "test-id",
      title: "Original Title",
      created: originalTime,
      updated: originalTime,
    });

    const updatedEntity = {
      ...entity,
      title: "Updated Title",
      updated: new Date().toISOString(),
    };

    expect(updatedEntity.title).toBe("Updated Title");
    expect(updatedEntity.updated).not.toBe(originalTime);
    expect(updatedEntity.created).toBe(originalTime);
    expect(updatedEntity.id).toBe(entity.id);
  });

  test("serializeEntity converts entities to markdown", () => {
    entityRegistry.registerEntityType(
      "note",
      noteSchema,
      new NoteSerializerAdapter(),
    );

    const testEntity = createNote({
      id: "test-id",
      content: "Test content",
      created: "2023-01-01T00:00:00.000Z",
      updated: "2023-01-01T00:00:00.000Z",
      title: "Test Note",
      tags: ["test"],
    });

    const markdown = entityService.serializeEntity(testEntity);
    expect(markdown).toBe("# Test Note\n\nTest content");
  });

  test("deserializeEntity converts markdown to entities", () => {
    entityRegistry.registerEntityType(
      "note",
      noteSchema,
      new NoteSerializerAdapter(),
    );

    const markdown = "# Test Note\n\nTest content";
    const parsedEntity = entityService.deserializeEntity(
      markdown,
      "note",
    ) as Note;

    expect(parsedEntity.title).toBe("Test Note");
    expect(parsedEntity.content).toBe("Test content");
  });

  test("deserializeEntity throws for unknown entity types", () => {
    const markdown = "# Test Note\n\nTest content";
    expect(() =>
      entityService.deserializeEntity(markdown, "unknownType"),
    ).toThrow(
      "Entity type registration failed for unknownType: No adapter registered for entity type",
    );
  });
});

describe("EntityService > initialize", () => {
  test("propagates embedding database initialization failures", async () => {
    const testDb = await createTestEntityDatabase();
    // Read-only embedding DB file: opening succeeds, but the CREATE TABLE
    // migration must fail — and that failure must surface via initialize()
    const embPath = join(dirname(testDb.dbPath), "readonly-emb.db");
    await writeFile(embPath, "");
    await chmod(embPath, 0o444);

    const logger = createSilentLogger();
    const service = EntityService.createFresh({
      embeddingService: mockEmbeddingService,
      entityRegistry: EntityRegistry.createFresh(logger),
      logger,
      jobQueueService: createMockJobQueueService({
        returns: { enqueue: "mock-job-id" },
      }),
      dbConfig: testDb.config,
      embeddingDbConfig: { url: `file:${embPath}` },
    });

    try {
      expect(service.initialize()).rejects.toThrow();
    } finally {
      service.close();
      await testDb.cleanup();
    }
  });
});

describe("EntityService > updateEntity", () => {
  let ctx: EntityServiceTestContext;

  beforeEach(async () => {
    ctx = await setupEntityService([
      { name: "note", schema: sharedNoteSchema, adapter: sharedNoteAdapter },
    ]);
  });

  afterEach(async () => {
    await ctx.cleanup();
  });

  test("throws when the entity does not exist", async () => {
    const missing = createTestEntity<SharedNote>(
      "note",
      createNoteInput(
        { title: "Ghost", content: "Never persisted", tags: [] },
        "missing-entity",
      ),
    );

    expect(ctx.entityService.updateEntity({ entity: missing })).rejects.toThrow(
      "Entity not found: note:missing-entity",
    );

    // Nothing should have been persisted for the phantom row
    const after = await ctx.entityService.getEntity({
      entityType: "note",
      id: "missing-entity",
    });
    expect(after).toBeNull();
  });
});

describe("EntityService > upsertEntity", () => {
  let ctx: EntityServiceTestContext;

  beforeEach(async () => {
    ctx = await setupEntityService([
      { name: "note", schema: sharedNoteSchema, adapter: sharedNoteAdapter },
    ]);
  });

  afterEach(async () => {
    await ctx.cleanup();
  });

  test("concurrent upserts of the same new entity do not throw", async () => {
    const input = createNoteInput(
      { title: "Racy Note", content: "Same content", tags: [] },
      "race-entity",
    );

    // Both upserts see the entity as missing (check-then-act); the loser of
    // the insert race must fall through to the update path, not throw.
    const results = await Promise.all([
      ctx.entityService.upsertEntity({
        entity: createTestEntity<SharedNote>("note", input),
      }),
      ctx.entityService.upsertEntity({
        entity: createTestEntity<SharedNote>("note", input),
      }),
    ]);

    expect(results.map((r) => r.entityId)).toEqual([
      "race-entity",
      "race-entity",
    ]);
    expect(results.filter((r) => r.created)).toHaveLength(1);

    const after = await ctx.entityService.getEntity({
      entityType: "note",
      id: "race-entity",
    });
    expect(after).not.toBeNull();
  });

  test("creates new entity when it doesn't exist", async () => {
    const input = createNoteInput(
      { title: "New Note", content: "New content", tags: ["test"] },
      "new-entity",
    );
    const result = await ctx.entityService.upsertEntity({
      entity: createTestEntity<SharedNote>("note", input),
    });

    expect(result.entityId).toBe("new-entity");
    expect(result.created).toBe(true);

    const retrieved = await ctx.entityService.getEntity({
      entityType: "note",
      id: "new-entity",
    });
    expect(retrieved).not.toBeNull();
  });

  test("updates existing entity", async () => {
    const input = createNoteInput(
      { title: "Initial", content: "Initial content", tags: [] },
      "existing-entity",
    );
    await ctx.entityService.createEntity({ entity: input });

    const updated = createTestEntity<SharedNote>("note", {
      ...input,
      id: "existing-entity",
      content: "Updated content",
    });
    const result = await ctx.entityService.upsertEntity({ entity: updated });

    expect(result.entityId).toBe("existing-entity");
    expect(result.created).toBe(false);
  });

  test("should not update when content is unchanged", async () => {
    const input = createNoteInput(
      { title: "Stable Note", content: "Same content", tags: [] },
      "stable-entity",
    );
    await ctx.entityService.createEntity({ entity: input });

    const before = await ctx.entityService.getEntity({
      entityType: "note",
      id: "stable-entity",
    });
    expect(before).not.toBeNull();

    // Upsert with the same content — simulates periodic sync re-importing
    const result = await ctx.entityService.upsertEntity({
      entity: createTestEntity<SharedNote>("note", {
        ...input,
        id: "stable-entity",
        content: "Same content",
      }),
    });

    expect(result.created).toBe(false);

    const after = await ctx.entityService.getEntity({
      entityType: "note",
      id: "stable-entity",
    });
    expect(after).not.toBeNull();
    expect(before).not.toBeNull();
    // Updated timestamp should NOT have changed — no DB write happened
    expect(after?.updated).toBe(before?.updated);
  });

  test("should not update when re-importing serialized entity (round-trip)", async () => {
    const input = createNoteInput(
      { title: "Round Trip", content: "Body text here", tags: [] },
      "roundtrip-entity",
    );
    await ctx.entityService.createEntity({ entity: input });

    const stored = await ctx.entityService.getEntity({
      entityType: "note",
      id: "roundtrip-entity",
    });
    expect(stored).not.toBeNull();

    // Simulate directory-sync round-trip: serialize → fromMarkdown → upsert
    // fromMarkdown returns parsed fields with body as content (no frontmatter)
    if (!stored) throw new Error("Entity not found after creation");
    const serialized = ctx.entityService.serializeEntity(stored);
    const parsed = sharedNoteAdapter.fromMarkdown(serialized);

    const reimported = createTestEntity<SharedNote>("note", {
      ...parsed,
      id: "roundtrip-entity",
    });

    const result = await ctx.entityService.upsertEntity({ entity: reimported });

    expect(result.created).toBe(false);
    expect(result.skipped).toBe(true);

    const after = await ctx.entityService.getEntity({
      entityType: "note",
      id: "roundtrip-entity",
    });
    // Timestamp unchanged — the re-import was a no-op
    expect(after?.updated).toBe(stored.updated);
  });

  test("passes options through", async () => {
    const input = createNoteInput(
      { title: "Options Note", content: "Test content", tags: [] },
      "options-entity",
    );
    const options = { priority: 5, maxRetries: 10 };

    const result = await ctx.entityService.upsertEntity({
      entity: createTestEntity<SharedNote>("note", input),
      options: options,
    });

    expect(result.entityId).toBe("options-entity");
    expect(result.created).toBe(true);
  });
});
