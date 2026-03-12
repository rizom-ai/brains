import { describe, expect, test, beforeEach, afterEach, mock } from "bun:test";
import { z } from "@brains/utils";
import { EntityService } from "../src/entityService";
import { EntityRegistry } from "../src/entityRegistry";
import { baseEntitySchema } from "../src/types";
import { BaseEntityAdapter } from "../src/adapters/base-entity-adapter";
import {
  createSilentLogger,
  createMockJobQueueService,
  createTestEntity,
} from "@brains/test-utils";
import { type Logger, createId } from "@brains/utils";
import { mockEmbeddingService } from "./helpers/mock-services";
import {
  setupEntityService,
  type EntityServiceTestContext,
} from "./helpers/setup-entity-service";
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
      schema: noteSchema,
      frontmatterSchema: z.object({ category: z.string().optional() }),
    });
  }

  public toMarkdown(entity: Note): string {
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

  beforeEach((): void => {
    EntityService.resetInstance();
    EntityRegistry.resetInstance();

    const mockJobQueueService = createMockJobQueueService({
      returns: { enqueue: "mock-job-id" },
    });

    logger = createSilentLogger();
    entityRegistry = EntityRegistry.createFresh(logger);
    entityService = EntityService.createFresh({
      embeddingService: mockEmbeddingService,
      entityRegistry,
      logger,
      jobQueueService: mockJobQueueService,
      dbConfig: { url: "file::memory:" },
    });
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
      schema: noteSchema,
      toMarkdown: mock(() => "Test content"),
      fromMarkdown: mock(() => ({ content: "Test content" })),
      extractMetadata: mock(() => ({})),
      parseFrontMatter: mock(() => ({})),
      generateFrontMatter: mock(() => ""),
    };
    const mockGetAdapter = mock(
      () => mockAdapter,
    ) as unknown as typeof entityRegistry.getAdapter;
    entityRegistry.getAdapter = mockGetAdapter;

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

  test("creates new entity when it doesn't exist", async () => {
    const input = createNoteInput(
      { title: "New Note", content: "New content", tags: ["test"] },
      "new-entity",
    );
    const result = await ctx.entityService.upsertEntity(
      createTestEntity<SharedNote>("note", input),
    );

    expect(result.entityId).toBe("new-entity");
    expect(result.created).toBe(true);

    const retrieved = await ctx.entityService.getEntity("note", "new-entity");
    expect(retrieved).not.toBeNull();
  });

  test("updates existing entity", async () => {
    const input = createNoteInput(
      { title: "Initial", content: "Initial content", tags: [] },
      "existing-entity",
    );
    await ctx.entityService.createEntity<SharedNote>(input);

    const updated = createTestEntity<SharedNote>("note", {
      ...input,
      id: "existing-entity",
      content: "Updated content",
    });
    const result = await ctx.entityService.upsertEntity(updated);

    expect(result.entityId).toBe("existing-entity");
    expect(result.created).toBe(false);
  });

  test("passes options through", async () => {
    const input = createNoteInput(
      { title: "Options Note", content: "Test content", tags: [] },
      "options-entity",
    );
    const options = { priority: 5, maxRetries: 10 };

    const result = await ctx.entityService.upsertEntity(
      createTestEntity<SharedNote>("note", input),
      options,
    );

    expect(result.entityId).toBe("options-entity");
    expect(result.created).toBe(true);
  });
});
