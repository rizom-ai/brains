import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createClient } from "@libsql/client";
import { sql } from "drizzle-orm";
import { SQLiteSyncDialect } from "drizzle-orm/sqlite-core";
import { z } from "@brains/utils/zod";
import { entities } from "../src/schema/entities";
import { entityIdHierarchyExpressions } from "../src/entity-id-path";
import type { ContentVisibility } from "../src/types";
import {
  minimalTestAdapter,
  minimalTestSchema,
  postAdapter,
  postSchema,
} from "./helpers/test-schemas";
import {
  setupEntityService,
  type EntityServiceTestContext,
} from "./helpers/setup-entity-service";

describe("entity hierarchy (real SQLite)", () => {
  let ctx: EntityServiceTestContext;
  beforeEach(async () => {
    ctx = await setupEntityService(
      [
        {
          name: "test",
          schema: minimalTestSchema,
          adapter: minimalTestAdapter,
        },
        { name: "post", schema: postSchema, adapter: postAdapter },
      ],
      { embeddingsEnabled: false },
    );
    await ctx.entityService.initialize();
  });
  afterEach(async () => {
    ctx.entityService.close();
    await ctx.cleanup();
  });

  async function add(
    id: string,
    visibility: ContentVisibility = "public",
    content = "Body",
    entityType = "test",
  ): Promise<void> {
    await ctx.entityService.createEntity({
      entity: {
        entityType,
        id,
        visibility,
        content,
        metadata: { status: "draft" },
      },
    });
  }

  async function inventory(): Promise<void> {
    for (const id of [
      "root-z",
      "root-a",
      "book",
      "book:intro",
      "book:part:one",
      "book:other:one",
      "bookish:one",
    ])
      await add(id);
    for (const id of ["book:part:two", "book:shared-leaf", "shared-only:one"])
      await add(id, "shared");
    for (const id of ["book:part:hidden", "book:private-leaf", "secret:one"])
      await add(id, "restricted");
    await add("other-type-only:one", "public", "Body", "post");
    await add("book:other-type-only:one", "public", "Body", "post");
  }

  test("nested prefix matching uses the existing ID index rather than a full scan", async () => {
    const condition = entityIdHierarchyExpressions(entities.id, [
      "book",
    ]).withinPrefix;
    const statement = new SQLiteSyncDialect().sqlToQuery(
      sql`SELECT ${entities.id} FROM ${entities} WHERE ${condition}`,
    );
    const client = createClient({ url: ctx.dbConfig.url });
    try {
      const plan = await client.execute({
        sql: `EXPLAIN QUERY PLAN ${statement.sql}`,
        args: z.array(z.string()).parse(statement.params),
      });
      expect(
        plan.rows.map((row) => String(row["detail"])).join("\n"),
      ).toContain("(id>? AND id<?)");
    } finally {
      client.close();
    }
  });

  test("root returns complete immediate folders and only direct entries", async () => {
    await inventory();
    const page = await ctx.entityService.queryEntityHierarchy({
      entityType: "test",
    });
    expect(page.prefix).toBeNull();
    expect(page.folders).toEqual([
      { path: ["book"], name: "book", descendantCount: 3 },
      { path: ["bookish"], name: "bookish", descendantCount: 1 },
    ]);
    expect(page.entities.map((row) => row.entity.id)).toEqual([
      "book",
      "root-a",
      "root-z",
    ]);
    expect(page.entities.map((row) => row.path)).toEqual([
      ["book"],
      ["root-a"],
      ["root-z"],
    ]);
    expect(page.totalEntities).toBe(3);
    expect(page.offset).toBe(0);
  });

  test("a nested prefix returns immediate children, not the prefix entity or its siblings", async () => {
    await inventory();
    const page = await ctx.entityService.queryEntityHierarchy({
      entityType: "test",
      prefix: ["book"],
    });
    expect(page.prefix).toEqual(["book"]);
    expect(page.folders).toEqual([
      { path: ["book", "other"], name: "other", descendantCount: 1 },
      { path: ["book", "part"], name: "part", descendantCount: 1 },
    ]);
    expect(page.entities.map((row) => row.entity.id)).toEqual(["book:intro"]);
    expect(page.entities[0]?.path).toEqual(["book", "intro"]);
    expect(page.totalEntities).toBe(1);
    const leaf = await ctx.entityService.queryEntityHierarchy({
      entityType: "test",
      prefix: ["book", "part"],
    });
    expect(leaf.folders).toEqual([]);
    expect(leaf.entities.map((row) => row.entity.id)).toEqual([
      "book:part:one",
    ]);
  });

  test.each([
    {
      scope: "public",
      folders: ["book", "bookish"],
      count: 3,
      leaves: 1,
      part: 1,
    },
    {
      scope: "shared",
      folders: ["book", "bookish", "shared-only"],
      count: 5,
      leaves: 2,
      part: 2,
    },
    {
      scope: "restricted",
      folders: ["book", "bookish", "secret", "shared-only"],
      count: 7,
      leaves: 3,
      part: 3,
    },
  ] as const)(
    "filters before deriving folders, counts and entries ($scope)",
    async ({ scope, folders, count, leaves, part }) => {
      await inventory();
      const root = await ctx.entityService.queryEntityHierarchy({
        entityType: "test",
        visibilityScope: scope,
      });
      expect(root.folders.map((folder) => folder.name)).toEqual([...folders]);
      expect(root.folders[0]?.descendantCount).toBe(count);
      const nested = await ctx.entityService.queryEntityHierarchy({
        entityType: "test",
        prefix: ["book"],
        visibilityScope: scope,
      });
      expect(nested.totalEntities).toBe(leaves);
      expect(nested.entities).toHaveLength(leaves);
      expect(
        nested.folders.find((folder) => folder.name === "part")
          ?.descendantCount,
      ).toBe(part);
    },
  );

  test("pagination never pages folders or counts descendants as direct entries", async () => {
    await inventory();
    for (const offset of [0, 1, 2, 100]) {
      const page = await ctx.entityService.queryEntityHierarchy({
        entityType: "test",
        limit: 1,
        offset,
      });
      expect(page.folders.map((folder) => folder.name)).toEqual([
        "book",
        "bookish",
      ]);
      expect(page.totalEntities).toBe(3);
      expect(page.offset).toBe(offset);
      expect(page.entities.map((row) => row.entity.id)).toEqual(
        ["book", "root-a", "root-z"].slice(offset, offset + 1),
      );
    }
  });

  test.each([
    "Book",
    "book%_",
    "book\\",
    "日本語😀",
    "\uFEFFbook",
    "book'quoted",
    "book\0name",
  ])("matches prefix %s literally and case-sensitively", async (prefix) => {
    await add(`${prefix}:one`);
    await add(`${prefix}:part:two`);
    await add("book:decoy");
    await add("bookXYZ:decoy");
    const page = await ctx.entityService.queryEntityHierarchy({
      entityType: "test",
      prefix: [prefix],
    });
    expect(page.entities.map((row) => row.entity.id)).toEqual([
      `${prefix}:one`,
    ]);
    expect(page.folders).toEqual([
      { path: [prefix, "part"], name: "part", descendantCount: 1 },
    ]);
    const root = await ctx.entityService.queryEntityHierarchy({
      entityType: "test",
    });
    expect(root.folders.find((folder) => folder.name === prefix)?.path).toEqual(
      [prefix],
    );
  });

  test("stored empty and path-like segments remain addressable without rewriting identity", async () => {
    await add(":book::intro");
    await add("book/part:..:intro");
    const empty = await ctx.entityService.queryEntityHierarchy({
      entityType: "test",
      prefix: ["", "book"],
    });
    expect(empty.folders).toEqual([
      { path: ["", "book", ""], name: "", descendantCount: 1 },
    ]);
    const nested = await ctx.entityService.queryEntityHierarchy({
      entityType: "test",
      prefix: ["", "book", ""],
    });
    expect(nested.entities[0]?.entity.id).toBe(":book::intro");
    const pathLike = await ctx.entityService.queryEntityHierarchy({
      entityType: "test",
      prefix: ["book/part", ".."],
    });
    expect(pathLike.entities[0]?.entity.id).toBe("book/part:..:intro");
    expect(pathLike.entities[0]?.path).toEqual(["book/part", "..", "intro"]);
  });

  test("filters content and metadata before deriving folders and leaf totals", async () => {
    await add("book:match", "public", "NEEDLE%_ body");
    await add("book:nested:match", "public", "needle%_ body");
    await add("book:hidden:match", "restricted", "needle%_ body");
    await add("book:no-match", "public", "needleXX body");
    await add("book:empty:entry", "public", "Different body");
    const page = await ctx.entityService.queryEntityHierarchy({
      entityType: "test",
      prefix: ["book"],
      filter: { contentContains: "needle%_", metadata: { status: "draft" } },
    });
    expect(page.entities.map((row) => row.entity.id)).toEqual(["book:match"]);
    expect(page.totalEntities).toBe(1);
    expect(page.folders).toEqual([
      { path: ["book", "nested"], name: "nested", descendantCount: 1 },
    ]);
    const denied = await ctx.entityService.queryEntityHierarchy({
      entityType: "test",
      prefix: ["book"],
      visibilityScope: "public",
      filter: { visibility: "restricted" },
    });
    expect(denied.entities).toEqual([]);
    expect(denied.folders).toEqual([]);
    expect(denied.totalEntities).toBe(0);
  });

  test("supports explicit entry sorting with deterministic ID tie-breaking", async () => {
    await add("z", "public", "Same");
    await add("a", "public", "Same");
    await add("nested:z", "public", "Same");
    const descending = await ctx.entityService.queryEntityHierarchy({
      entityType: "test",
      sortFields: [{ field: "id", direction: "desc" }],
    });
    expect(descending.entities.map((row) => row.entity.id)).toEqual(["z", "a"]);
    const tied = await ctx.entityService.queryEntityHierarchy({
      entityType: "test",
      sortFields: [{ field: "status", direction: "asc" }],
    });
    expect(tied.entities.map((row) => row.entity.id)).toEqual(["a", "z"]);
  });

  test("returns an empty page for an absent prefix and leaves direct entity reads unchanged", async () => {
    await add("book:intro");
    const before = await ctx.entityService.getEntity({
      entityType: "test",
      id: "book:intro",
    });
    const missing = await ctx.entityService.queryEntityHierarchy({
      entityType: "test",
      prefix: ["absent"],
    });
    expect(missing).toEqual({
      prefix: ["absent"],
      folders: [],
      entities: [],
      offset: 0,
      totalEntities: 0,
    });
    await ctx.entityService.queryEntityHierarchy({
      entityType: "test",
      prefix: ["book"],
    });
    expect(
      await ctx.entityService.getEntity({
        entityType: "test",
        id: "book:intro",
      }),
    ).toEqual(before);
  });

  test("bounds complete folder results without counting invisible folders or truncating", async () => {
    const client = createClient({ url: ctx.dbConfig.url });
    try {
      await client.execute(`WITH RECURSIVE n(i) AS (VALUES(1) UNION ALL SELECT i+1 FROM n WHERE i < 1000)
        INSERT INTO entities (id, entityType, content, contentHash, visibility, created, updated)
        SELECT 'hidden-' || i || ':leaf', 'test', 'Body', 'hash', 'restricted', 0, 0 FROM n`);
      await add("visible:leaf");
      const publicPage = await ctx.entityService.queryEntityHierarchy({
        entityType: "test",
      });
      expect(publicPage.folders).toEqual([
        { path: ["visible"], name: "visible", descendantCount: 1 },
      ]);
      const overflow = await ctx.entityService
        .queryEntityHierarchy({
          entityType: "test",
          visibilityScope: "restricted",
        })
        .catch((error: unknown) => error);
      expect(overflow).toBeInstanceOf(Error);
      expect(overflow).toMatchObject({
        message: expect.stringContaining("1000 immediate folders"),
      });
      await client.execute(
        "DELETE FROM entities WHERE id = 'hidden-1000:leaf' AND entityType = 'test'",
      );
      const boundary = await ctx.entityService.queryEntityHierarchy({
        entityType: "test",
        visibilityScope: "restricted",
      });
      expect(boundary.folders).toHaveLength(1000);
    } finally {
      client.close();
    }
  });

  test("defaults to a bounded entry page and preserves the full direct count", async () => {
    const client = createClient({ url: ctx.dbConfig.url });
    try {
      await client.execute(`WITH RECURSIVE n(i) AS (VALUES(1) UNION ALL SELECT i+1 FROM n WHERE i < 51)
        INSERT INTO entities (id, entityType, content, contentHash, created, updated)
        SELECT printf('%03d', i), 'test', 'Body', 'hash', 0, 0 FROM n`);
      const first = await ctx.entityService.queryEntityHierarchy({
        entityType: "test",
      });
      expect(first.totalEntities).toBe(51);
      expect(first.entities).toHaveLength(50);
      expect(first.entities[49]?.entity.id).toBe("050");
      const last = await ctx.entityService.queryEntityHierarchy({
        entityType: "test",
        offset: 50,
      });
      expect(last.entities.map((row) => row.entity.id)).toEqual(["051"]);
      expect(last.totalEntities).toBe(51);
    } finally {
      client.close();
    }
  });

  test("honors caller cancellation before querying", async () => {
    const reason = new Error("cancelled hierarchy read");
    const outcome = await ctx.entityService
      .queryEntityHierarchy({
        entityType: "test",
        signal: AbortSignal.abort(reason),
      })
      .catch((error: unknown) => error);
    expect(outcome).toBe(reason);
  });

  test("rejects malformed prefixes and invalid pagination", async () => {
    for (const prefix of [[], ["book:part"], [42], "book"]) {
      // Deliberately exercise the untrusted runtime boundary, not a TypeScript cast.
      const outcome = await ctx.entityService
        .queryEntityHierarchy(
          JSON.parse(JSON.stringify({ entityType: "test", prefix })),
        )
        .catch((error: unknown) => error);
      expect(outcome).toBeInstanceOf(z.ZodError);
    }
    for (const pagination of [
      { limit: 0 },
      { limit: 101 },
      { offset: -1 },
      { limit: 1.5 },
      { offset: Number.MAX_SAFE_INTEGER + 1 },
    ]) {
      const outcome = await ctx.entityService
        .queryEntityHierarchy({
          entityType: "test",
          ...pagination,
        })
        .catch((error: unknown) => error);
      expect(outcome).toBeInstanceOf(z.ZodError);
    }
  });
});
