import { describe, expect, it } from "bun:test";
import {
  createMockEntityStore,
  type MockEntityStore,
} from "../src/test/mock-entity-store";
import { createMockEntityService } from "../src/test/mock-entity-service";
import {
  baseEntitySchema,
  type BaseEntity,
  type EntityAdapter,
  type EntityInput,
  type IEntityService,
} from "@brains/entity-service";

function noteEntity(overrides: Partial<BaseEntity> = {}): BaseEntity {
  return {
    id: "note-1",
    entityType: "note",
    content: "# Note",
    metadata: {},
    created: "2026-01-01T00:00:00.000Z",
    updated: "2026-01-01T00:00:00.000Z",
    contentHash: "",
    visibility: "public",
    ...overrides,
  };
}

function noteAdapter(
  overrides: Partial<EntityAdapter<BaseEntity>> = {},
): EntityAdapter<BaseEntity> {
  return {
    entityType: "note",
    purpose: "A note, for testing the entity service double.",
    schema: baseEntitySchema,
    toMarkdown: (entity): string => entity.content,
    fromMarkdown: (): Partial<BaseEntity> => ({}),
    extractMetadata: (entity): Record<string, unknown> => entity.metadata,
    parseFrontMatter: <TFrontmatter>(
      _markdown: string,
      schema: { parse(data: unknown): TFrontmatter },
    ): TFrontmatter => schema.parse({}),
    generateFrontMatter: (): string => "",
    getBodyTemplate: (): string => "",
    ...overrides,
  };
}

function noteInput(content: string): EntityInput<BaseEntity> {
  return { entityType: "note", content, metadata: {} };
}

describe("createMockEntityStore", () => {
  it("serializes verbatim when no adapter is registered", () => {
    const store = createMockEntityStore();
    expect(store.serialize(noteEntity())).toEqual({
      content: "# Note",
      metadata: {},
    });
  });

  it("serializes through the adapter when one is registered", () => {
    const store = createMockEntityStore();
    store.adapters.set(
      "note",
      noteAdapter({
        toMarkdown: (): string => "from adapter",
        extractMetadata: (): Record<string, unknown> => ({ via: "adapter" }),
      }),
    );

    expect(store.serialize(noteEntity())).toEqual({
      content: "from adapter",
      metadata: { via: "adapter" },
    });
  });

  it("falls back to verbatim for a stub adapter with no toMarkdown", () => {
    // Tests register entity types with a stub to satisfy the registry
    // signature without caring about serialization; that must not throw.
    const store = createMockEntityStore();
    const stub = noteAdapter();
    Reflect.deleteProperty(stub, "toMarkdown");
    store.adapters.set("note", stub);

    expect(store.serialize(noteEntity()).content).toBe("# Note");
  });

  it("records an export intent with a rising revision", () => {
    const store = createMockEntityStore();
    store.markExportIntent("note", "a", "upsert");
    store.markExportIntent("note", "b", "delete");

    const intents = Array.from(store.exportIntents.values());
    expect(intents.map((intent) => intent.operation)).toEqual([
      "upsert",
      "delete",
    ]);
    expect(intents[1]?.markedAt).toBeGreaterThan(intents[0]?.markedAt ?? 0);
  });

  it("clears rather than records an intent written by directory sync", () => {
    // A write that came from directory sync is already on disk; marking it
    // for export would send it straight back out again.
    const store = createMockEntityStore();
    store.markExportIntent("note", "a", "upsert");
    expect(store.exportIntents.size).toBe(1);

    store.markExportIntent("note", "a", "upsert", "directory-sync");
    expect(store.exportIntents.size).toBe(0);
  });

  it("keys intents so one pair cannot overwrite another", () => {
    const store = createMockEntityStore();
    expect(store.exportKey("note", "a")).not.toBe(store.exportKey("not", "ea"));
  });
});

describe("createMockEntityService", () => {
  function serviceWithStore(): {
    store: MockEntityStore;
    service: IEntityService;
  } {
    const store = createMockEntityStore();
    return { store, service: createMockEntityService(store) };
  }

  it("writes through to the store it was given, not a copy of it", async () => {
    const { store, service } = serviceWithStore();
    const result = await service.createEntity({ entity: noteInput("hello") });

    expect(store.entities.get(result.entityId)?.content).toBe("hello");
    expect(store.types.has("note")).toBe(true);
  });

  it("fills the fields the real service owns", async () => {
    const { store, service } = serviceWithStore();
    const { entityId } = await service.createEntity({
      entity: noteInput("hello"),
    });

    const stored = store.entities.get(entityId);
    expect(stored?.id).toBe(entityId);
    expect(stored?.created).toBeTruthy();
    expect(stored?.contentHash).not.toBe("");
  });

  it("serializes a created entity through the registered adapter", async () => {
    const { store, service } = serviceWithStore();
    store.adapters.set(
      "note",
      noteAdapter({ toMarkdown: (): string => "rebuilt" }),
    );

    const { entityId } = await service.createEntity({
      entity: noteInput("hello"),
    });
    expect(store.entities.get(entityId)?.content).toBe("rebuilt");
  });

  it("deserializes with the registered adapter and preserves unregistered source", () => {
    const { store, service } = serviceWithStore();
    const markdown = "---\nstatus: published\n---\nBody";
    expect(service.deserializeEntity(markdown, "note")).toEqual({
      content: markdown,
    });
    store.adapters.set(
      "note",
      noteAdapter({
        fromMarkdown: (content): Partial<BaseEntity> => ({
          content,
          metadata: { status: "published" },
        }),
      }),
    );
    expect(service.deserializeEntity(markdown, "note")).toEqual({
      content: markdown,
      metadata: { status: "published" },
    });
  });

  it("refuses the projection store rather than faking one", () => {
    const { service } = serviceWithStore();
    // An empty stand-in would make a projection test silently meaningless.
    expect(() => service.getProjectionStore()).toThrow(
      /getProjectionStore is not mocked/,
    );
  });
});
