import { describe, expect, test, beforeEach, mock } from "bun:test";
import { z } from "@brains/utils";
import { EntityService } from "../src/entityService";
import { EntityRegistry } from "../src/entityRegistry";
import type { EntityAdapter, BaseEntity } from "../src/types";
import { baseEntitySchema } from "../src/types";
import {
  createSilentLogger,
  createMockJobQueueService,
  createTestEntity,
} from "@brains/test-utils";
import { type Logger, createId } from "@brains/utils";
import { mockEmbeddingService } from "./helpers/mock-services";

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
    const testAdapter: EntityAdapter<Note> = {
      entityType: "note",
      schema: noteSchema,
      toMarkdown: (entity: Note): string =>
        `# ${entity.title}\n\n${entity.content}`,
      fromMarkdown: (_markdown: string): Partial<Note> => {
        const lines = _markdown.split("\n");
        const title = lines[0]?.replace(/^#\s*/, "") ?? "Untitled";
        const content = lines.slice(2).join("\n");
        return { title, content };
      },
      extractMetadata: (entity: Note): Record<string, unknown> => ({
        category: entity.category,
      }),
      parseFrontMatter: <TFrontmatter>(
        _markdown: string,
        schema: z.ZodSchema<TFrontmatter>,
      ): TFrontmatter => schema.parse({}),
      generateFrontMatter: (entity: Note): string => {
        return `---\ncategory: ${entity.category ?? ""}\n---\n`;
      },
    };

    entityRegistry.registerEntityType("note", noteSchema, testAdapter);

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
    const testAdapter: EntityAdapter<Note> = {
      entityType: "note",
      schema: noteSchema,
      toMarkdown: (entity: Note): string =>
        `# ${entity.title}\n\n${entity.content}`,
      fromMarkdown: (_markdown: string): Partial<Note> => {
        const lines = _markdown.split("\n");
        const title = lines[0]?.replace(/^#\s*/, "") ?? "Untitled";
        const content = lines.slice(2).join("\n");
        return { title, content };
      },
      extractMetadata: (entity: Note): Record<string, unknown> => ({
        category: entity.category,
      }),
      parseFrontMatter: <TFrontmatter>(
        _markdown: string,
        schema: z.ZodSchema<TFrontmatter>,
      ): TFrontmatter => schema.parse({}),
      generateFrontMatter: (entity: Note): string => {
        return `---\ncategory: ${entity.category ?? ""}\n---\n`;
      },
    };

    entityRegistry.registerEntityType("note", noteSchema, testAdapter);

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

  test("upsertEntity creates new entity when it doesn't exist", async () => {
    const testEntity = createTestEntity<BaseEntity>("base", {
      id: "new-entity",
      content: "New content",
    });

    entityService.getEntity = mock((_entityType: string, _id: string) =>
      Promise.resolve(null),
    );
    entityService.createEntity = mock(() =>
      Promise.resolve({ entityId: "new-entity", jobId: "job-123" }),
    );

    const result = await entityService.upsertEntity(testEntity);

    expect(result.entityId).toBe("new-entity");
    expect(result.jobId).toBe("job-123");
    expect(result.created).toBe(true);
    expect(entityService.getEntity).toHaveBeenCalledWith("base", "new-entity");
    expect(entityService.createEntity).toHaveBeenCalledWith(
      testEntity,
      undefined,
    );
  });

  test("upsertEntity updates existing entity", async () => {
    const existingEntity = createTestEntity<BaseEntity>("base", {
      id: "existing-entity",
      content: "Initial content",
      created: "2023-01-01T00:00:00.000Z",
      updated: "2023-01-01T00:00:00.000Z",
    });

    const updatedEntity = createTestEntity<BaseEntity>("base", {
      ...existingEntity,
      content: "Updated content",
    });

    entityService.getEntity = mock((_entityType: string, _id: string) =>
      Promise.resolve(existingEntity),
    ) as typeof entityService.getEntity;
    entityService.updateEntity = mock(() =>
      Promise.resolve({ entityId: "existing-entity", jobId: "job-456" }),
    );

    const result = await entityService.upsertEntity(updatedEntity);

    expect(result.entityId).toBe("existing-entity");
    expect(result.jobId).toBe("job-456");
    expect(result.created).toBe(false);
    expect(entityService.getEntity).toHaveBeenCalledWith(
      "base",
      "existing-entity",
    );
    expect(entityService.updateEntity).toHaveBeenCalledWith(
      updatedEntity,
      undefined,
    );
  });

  test("upsertEntity passes options to create/update", async () => {
    const testEntity = createTestEntity<BaseEntity>("base", {
      id: "test-entity",
      content: "Test content",
    });

    const options = { priority: 5, maxRetries: 10 };

    entityService.getEntity = mock((_entityType: string, _id: string) =>
      Promise.resolve(null),
    );
    entityService.createEntity = mock(() =>
      Promise.resolve({ entityId: "test-entity", jobId: "job-789" }),
    );

    await entityService.upsertEntity(testEntity, options);

    expect(entityService.createEntity).toHaveBeenCalledWith(
      testEntity,
      options,
    );
  });
});
