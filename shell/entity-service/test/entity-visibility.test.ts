import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { z } from "@brains/utils";
import { createTestEntity } from "@brains/test-utils";
import { createEntityDatabase } from "../src/db";
import { entities } from "../src/schema/entities";
import {
  baseEntitySchema,
  getVisibleContentVisibilities,
  isVisibleWithinScope,
  type BaseEntity,
} from "../src/types";
import { BaseEntityAdapter } from "../src/adapters/base-entity-adapter";
import { FallbackEntityAdapter } from "../src/adapters/fallback-entity-adapter";
import {
  setupEntityService,
  type EntityServiceTestContext,
} from "./helpers/setup-entity-service";
import {
  noteSchema,
  noteAdapter,
  createNoteInput,
  type Note,
} from "./helpers/test-schemas";
import { MOCK_DIMENSIONS } from "./helpers/mock-services";

const visibilityNoteSchema = baseEntitySchema.extend({
  entityType: z.literal("visibility-note"),
  metadata: z.object({
    title: z.string().optional(),
  }),
});

type VisibilityNote = z.infer<typeof visibilityNoteSchema>;

class VisibilityNoteAdapter extends BaseEntityAdapter<
  VisibilityNote,
  VisibilityNote["metadata"]
> {
  constructor() {
    super({
      entityType: "visibility-note",
      schema: visibilityNoteSchema,
      frontmatterSchema: z.object({
        title: z.string().optional(),
        visibility: z
          .enum(["public", "shared", "restricted", "private"])
          .optional(),
      }),
    });
  }

  public override toMarkdown(entity: VisibilityNote): string {
    const title = entity.metadata.title ?? "Untitled";
    return this.buildMarkdown(entity.content, { title });
  }

  public fromMarkdown(markdown: string): Partial<VisibilityNote> {
    const frontmatter = this.parseFrontmatter(markdown);
    return {
      content: this.extractBody(markdown),
      metadata: {
        ...(frontmatter.title !== undefined
          ? { title: frontmatter.title }
          : {}),
      },
    };
  }
}

describe("entity visibility scope utilities", () => {
  test("matches canonical visibility scope semantics", () => {
    expect(isVisibleWithinScope(undefined, "public")).toBe(true);
    expect(isVisibleWithinScope("public", "public")).toBe(true);
    expect(isVisibleWithinScope("shared", "public")).toBe(false);
    expect(isVisibleWithinScope("restricted", "public")).toBe(false);

    expect(isVisibleWithinScope("public", "shared")).toBe(true);
    expect(isVisibleWithinScope("shared", "shared")).toBe(true);
    expect(isVisibleWithinScope("restricted", "shared")).toBe(false);

    expect(isVisibleWithinScope("public", "restricted")).toBe(true);
    expect(isVisibleWithinScope("shared", "restricted")).toBe(true);
    expect(isVisibleWithinScope("restricted", "restricted")).toBe(true);
  });

  test("returns the canonical visibility values visible within a scope", () => {
    expect(getVisibleContentVisibilities("public")).toEqual(["public"]);
    expect(getVisibleContentVisibilities("shared")).toEqual([
      "public",
      "shared",
    ]);
    expect(getVisibleContentVisibilities("restricted")).toEqual([
      "public",
      "shared",
      "restricted",
    ]);
  });
});

describe("entity visibility", () => {
  let ctx: EntityServiceTestContext;

  beforeEach(async () => {
    ctx = await setupEntityService([
      { name: "note", schema: noteSchema, adapter: noteAdapter },
      {
        name: "visibility-note",
        schema: visibilityNoteSchema,
        adapter: new VisibilityNoteAdapter(),
      },
    ]);
  });

  afterEach(async () => {
    await ctx.cleanup();
  });

  test("baseEntitySchema defaults missing visibility to public", () => {
    const parsed = baseEntitySchema.parse({
      id: "base-note",
      entityType: "base",
      content: "Body",
      created: "2024-01-01T00:00:00.000Z",
      updated: "2024-01-01T00:00:00.000Z",
      metadata: {},
      contentHash: "hash",
    });

    expect(parsed.visibility).toBe("public");
  });

  test("baseEntitySchema normalizes private visibility input to restricted", () => {
    const parsed = baseEntitySchema.parse({
      id: "base-note",
      entityType: "base",
      content: "Body",
      created: "2024-01-01T00:00:00.000Z",
      updated: "2024-01-01T00:00:00.000Z",
      visibility: "private",
      metadata: {},
      contentHash: "hash",
    });

    expect(parsed.visibility).toBe("restricted");
  });

  test("createEntity stores canonical visibility outside metadata", async () => {
    const entity = createTestEntity<VisibilityNote>("visibility-note", {
      id: "restricted-note",
      content: "Sensitive body",
      visibility: "private",
      metadata: { title: "Sensitive" },
    });

    await ctx.entityService.createEntity({ entity });

    const stored = await ctx.entityService.getEntity<VisibilityNote>({
      entityType: "visibility-note",
      id: "restricted-note",
    });

    expect(stored?.visibility).toBe("restricted");
    expect(stored?.metadata).toEqual({ title: "Sensitive" });

    const serialized = stored ? ctx.entityService.serializeEntity(stored) : "";
    expect(serialized).toContain("visibility: restricted");
    expect(serialized).not.toContain("visibility: private");
  });

  test("public entities omit visibility from serialized markdown", async () => {
    const entity = createNoteInput(
      { title: "Public", content: "Public body", tags: [] },
      "public-note",
    );

    await ctx.entityService.createEntity({ entity });

    const stored = await ctx.entityService.getEntity<Note>({
      entityType: "note",
      id: "public-note",
    });

    expect(stored?.visibility).toBe("public");
    expect(
      stored ? ctx.entityService.serializeEntity(stored) : "",
    ).not.toContain("visibility:");
  });

  test("listEntities filters by visibility scope", async () => {
    await ctx.entityService.createEntity({
      entity: createTestEntity<VisibilityNote>("visibility-note", {
        id: "public-doc",
        content: "Public body",
        visibility: "public",
        metadata: { title: "Public" },
      }),
    });
    await ctx.entityService.createEntity({
      entity: createTestEntity<VisibilityNote>("visibility-note", {
        id: "shared-doc",
        content: "Shared body",
        visibility: "shared",
        metadata: { title: "Shared" },
      }),
    });
    await ctx.entityService.createEntity({
      entity: createTestEntity<VisibilityNote>("visibility-note", {
        id: "restricted-doc",
        content: "Restricted body",
        visibility: "restricted",
        metadata: { title: "Restricted" },
      }),
    });

    const publicOnly = await ctx.entityService.listEntities<VisibilityNote>({
      entityType: "visibility-note",
      options: { filter: { visibilityScope: "public" } },
    });
    const sharedScope = await ctx.entityService.listEntities<VisibilityNote>({
      entityType: "visibility-note",
      options: { filter: { visibilityScope: "shared" } },
    });
    const anchorScope = await ctx.entityService.listEntities<VisibilityNote>({
      entityType: "visibility-note",
      options: { filter: { visibilityScope: "restricted" } },
    });

    expect(publicOnly.map((entity) => entity.id)).toEqual(["public-doc"]);
    expect(sharedScope.map((entity) => entity.id).sort()).toEqual([
      "public-doc",
      "shared-doc",
    ]);
    expect(anchorScope.map((entity) => entity.id).sort()).toEqual([
      "public-doc",
      "restricted-doc",
      "shared-doc",
    ]);
  });

  test("search filters by visibility scope before returning results", async () => {
    const publicEntity = createTestEntity<VisibilityNote>("visibility-note", {
      id: "public-search-doc",
      content: "Visibility filtering keyword",
      visibility: "public",
      metadata: { title: "Public" },
    });
    const sharedEntity = createTestEntity<VisibilityNote>("visibility-note", {
      id: "shared-search-doc",
      content: "Visibility filtering keyword",
      visibility: "shared",
      metadata: { title: "Shared" },
    });
    const restrictedEntity = createTestEntity<VisibilityNote>(
      "visibility-note",
      {
        id: "restricted-search-doc",
        content: "Visibility filtering keyword",
        visibility: "restricted",
        metadata: { title: "Restricted" },
      },
    );

    for (const entity of [publicEntity, sharedEntity, restrictedEntity]) {
      await ctx.entityService.createEntity({ entity });
      await ctx.entityService.storeEmbedding({
        entityId: entity.id,
        entityType: entity.entityType,
        embedding: new Float32Array(MOCK_DIMENSIONS).fill(0.1),
        contentHash: entity.contentHash,
      });
    }

    const publicResults = await ctx.entityService.search<VisibilityNote>({
      query: "Visibility filtering keyword",
      options: { types: ["visibility-note"], visibilityScope: "public" },
    });
    const trustedResults = await ctx.entityService.search<VisibilityNote>({
      query: "Visibility filtering keyword",
      options: { types: ["visibility-note"], visibilityScope: "shared" },
    });
    const anchorResults = await ctx.entityService.search<VisibilityNote>({
      query: "Visibility filtering keyword",
      options: { types: ["visibility-note"], visibilityScope: "restricted" },
    });

    expect(publicResults.map((result) => result.entity.id).sort()).toEqual([
      "public-search-doc",
    ]);
    expect(trustedResults.map((result) => result.entity.id).sort()).toEqual([
      "public-search-doc",
      "shared-search-doc",
    ]);
    expect(anchorResults.map((result) => result.entity.id).sort()).toEqual([
      "public-search-doc",
      "restricted-search-doc",
      "shared-search-doc",
    ]);
  });

  test("deserializeEntity reads visibility and normalizes private synonym", () => {
    const parsed = ctx.entityService.deserializeEntity(
      "---\ntitle: Imported\nvisibility: private\n---\n\nImported body",
      "visibility-note",
    );

    expect(parsed.visibility).toBe("restricted");
    expect(parsed.metadata).toEqual({ title: "Imported" });
  });
});

describe("base note visibility serialization", () => {
  let ctx: EntityServiceTestContext;

  beforeEach(async () => {
    ctx = await setupEntityService([
      {
        name: "base",
        schema: baseEntitySchema,
        adapter: new FallbackEntityAdapter(),
      },
    ]);
  });

  afterEach(async () => {
    await ctx.cleanup();
  });

  test("keeps public base notes as raw markdown without frontmatter", async () => {
    const rawContent =
      "# Plain note\n\nSome text.\n\n---\n\nA horizontal rule.";

    await ctx.entityService.createEntity({
      entity: createTestEntity<BaseEntity>("base", {
        id: "plain-note",
        content: rawContent,
      }),
    });

    const stored = await ctx.entityService.getEntity<BaseEntity>({
      entityType: "base",
      id: "plain-note",
    });

    expect(stored?.visibility).toBe("public");
    expect(stored ? ctx.entityService.serializeEntity(stored) : "").toBe(
      rawContent,
    );
  });

  test("adds canonical visibility frontmatter for restricted base notes", async () => {
    const rawContent = "# Sensitive note\n\nInternal details.";

    await ctx.entityService.createEntity({
      entity: createTestEntity<BaseEntity>("base", {
        id: "restricted-plain-note",
        content: rawContent,
        visibility: "private",
      }),
    });

    const stored = await ctx.entityService.getEntity<BaseEntity>({
      entityType: "base",
      id: "restricted-plain-note",
    });

    const serialized = stored ? ctx.entityService.serializeEntity(stored) : "";
    expect(stored?.visibility).toBe("restricted");
    expect(serialized).toStartWith("---\nvisibility: restricted\n---");
    expect(serialized).toContain(rawContent);
    expect(serialized).not.toContain("visibility: private");
  });
});

describe("entity visibility database mapping", () => {
  let ctx: EntityServiceTestContext;

  beforeEach(async () => {
    ctx = await setupEntityService([
      { name: "note", schema: noteSchema, adapter: noteAdapter },
    ]);
  });

  afterEach(async () => {
    await ctx.cleanup();
  });

  test("persists visibility in the entities table", async () => {
    await ctx.entityService.createEntity({
      entity: createTestEntity<Note>("note", {
        id: "db-note",
        content: "DB body",
        title: "DB Note",
        tags: [],
        visibility: "shared",
      }),
    });

    const { db, client } = createEntityDatabase(ctx.dbConfig);
    const rows = await db.select().from(entities);
    client.close();

    expect(rows[0]?.visibility).toBe("shared");
    expect(rows[0]?.metadata).not.toHaveProperty("visibility");
  });

  test("rejects invalid visibility values at the database layer", async () => {
    const { db, client } = createEntityDatabase(ctx.dbConfig);
    let caught: unknown;
    try {
      // SQLite's typed driver still emits the value; the CHECK constraint
      // is what rejects values outside the canonical enum.
      await db.insert(entities).values({
        id: "bad-visibility",
        entityType: "note",
        content: "body",
        contentHash: "hash",
        visibility: "secret" as unknown as "public",
        metadata: {},
        created: Date.now(),
        updated: Date.now(),
      });
    } catch (error) {
      caught = error;
    } finally {
      client.close();
    }
    expect(caught).toBeInstanceOf(Error);
  });
});
