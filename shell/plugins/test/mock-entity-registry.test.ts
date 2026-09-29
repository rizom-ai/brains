import { describe, expect, it } from "bun:test";
import { createMockEntityStore } from "../src/test/mock-entity-store";
import { createMockEntityRegistry } from "../src/test/mock-entity-registry";
import {
  baseEntitySchema,
  type BaseEntity,
  type EntityAdapter,
  type UploadSaveHandler,
} from "@brains/entity-service";

function noteAdapter(
  overrides: Partial<EntityAdapter<BaseEntity>> = {},
): EntityAdapter<BaseEntity> {
  return {
    entityType: "note",
    purpose: "A note, for testing the entity registry double.",
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

// The registry only files handlers by media type; what one does on save is
// the entity service's business, so one stub stands in for all of them.
const uploadHandler: UploadSaveHandler = async () => ({
  success: true,
  data: { entityId: "saved", status: "created" },
});

describe("createMockEntityRegistry", () => {
  it("registers into the store the service reads", () => {
    // The registry and the service are two views of one store; a copy at this
    // seam would let a test register a type the service never sees.
    const store = createMockEntityStore();
    const registry = createMockEntityRegistry(store);
    const adapter = noteAdapter();

    registry.registerEntityType("note", baseEntitySchema, adapter);

    expect(store.types.has("note")).toBe(true);
    expect(store.adapters.get("note")).toBe(adapter);
  });

  it("removes every trace of a type it unregisters", () => {
    const store = createMockEntityStore();
    const registry = createMockEntityRegistry(store);
    registry.registerEntityType("note", baseEntitySchema, noteAdapter(), {});
    registry.registerCreateInterceptor("note", async (input) => ({
      kind: "continue",
      input,
    }));

    registry.unregisterEntityType("note");

    expect(registry.hasEntityType("note")).toBe(false);
    expect(registry.getCreateInterceptor("note")).toBeUndefined();
    expect(store.adapters.has("note")).toBe(false);
    expect(store.typeConfigs.has("note")).toBe(false);
  });

  it("refuses an adapter it does not have rather than returning nothing", () => {
    const registry = createMockEntityRegistry(createMockEntityStore());
    expect(() => registry.getAdapter("absent")).toThrow(
      /No adapter registered/,
    );
  });

  it("validates through the registered adapter's schema", () => {
    const store = createMockEntityStore();
    const registry = createMockEntityRegistry(store);
    registry.registerEntityType("note", baseEntitySchema, noteAdapter());

    expect(() => registry.validateEntity("note", { nope: true })).toThrow();
    expect(() => registry.validateEntity("absent", {})).toThrow(
      /No schema registered/,
    );
  });

  it("matches an upload handler on a wildcard media type by prefix", () => {
    const registry = createMockEntityRegistry(createMockEntityStore());
    registry.registerUploadSaveHandler({
      entityType: "image",
      mediaTypes: ["image/*"],
      handler: uploadHandler,
    });

    expect(registry.getUploadSaveHandler("image/png")).toBeDefined();
    expect(registry.getUploadSaveHandler("video/mp4")).toBeUndefined();
    // The prefix is matched without the star, so the bare type matches too.
    expect(registry.getUploadSaveHandler("image/")).toBeDefined();
  });

  it("matches a non-wildcard media type exactly, not by prefix", () => {
    const registry = createMockEntityRegistry(createMockEntityStore());
    registry.registerUploadSaveHandler({
      entityType: "doc",
      mediaTypes: ["application/pdf"],
      handler: uploadHandler,
    });

    expect(registry.getUploadSaveHandler("application/pdf")).toBeDefined();
    expect(registry.getUploadSaveHandler("application/pdf-x")).toBeUndefined();
  });

  it("returns the first registered handler that matches", () => {
    const registry = createMockEntityRegistry(createMockEntityStore());
    registry.registerUploadSaveHandler({
      entityType: "image",
      mediaTypes: ["image/*"],
      handler: uploadHandler,
    });
    registry.registerUploadSaveHandler({
      entityType: "image",
      mediaTypes: ["image/png"],
      handler: uploadHandler,
    });

    const handler = registry.getUploadSaveHandler("image/png");
    expect(handler?.mediaTypes).toEqual(["image/*"]);
  });
});
