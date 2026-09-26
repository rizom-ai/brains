import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createClient } from "@libsql/client";
import { z } from "@brains/utils/zod";
import { EntityRegistry } from "../src/entityRegistry";
import { createSilentLogger } from "@brains/test-utils";
import {
  minimalTestAdapter,
  minimalTestSchema,
  postAdapter,
  postSchema,
  reuseAdapter,
  reuseSchema,
  strictAdapter,
  strictSchema,
} from "./helpers/test-schemas";
import {
  setupEntityService,
  type EntityServiceTestContext,
} from "./helpers/setup-entity-service";
import type { ContentVisibility } from "../src/types";

const clients = {
  key: "clients",
  label: "Clients",
  field: "clients",
  types: ["test", "post"],
};

describe("grouping registration", () => {
  function registry(): EntityRegistry {
    const value = EntityRegistry.createFresh(createSilentLogger());
    value.registerEntityType("test", minimalTestSchema, minimalTestAdapter);
    value.registerEntityType("post", postSchema, postAdapter);
    return value;
  }
  test("does not parse raw source without registered projection fields", () => {
    const value = registry();
    const metadata = { title: "Raw document" };
    for (const source of [
      "---\ntitle: [broken\n---\nBody",
      "---\nA horizontal rule and prose",
    ]) {
      expect(value.projectMetadata("test", source, metadata)).toEqual(metadata);
      expect(value.projectStoredMetadata("test", source, metadata)).toEqual(
        metadata,
      );
    }
    value.registerGrouping(clients);
    expect(() =>
      value.projectMetadata("test", "---\nclients: [broken\n---", metadata),
    ).toThrow();
  });
  test("declares one grouping across two types and admits its list field", () => {
    const value = registry();
    value.registerGrouping(clients);
    expect(value.getGroupings()).toEqual([clients]);
    expect(
      value
        .getEffectiveFrontmatterSchema("post")
        ?.safeParse({ clients: ["Acme", "Beta"] }).success,
    ).toBe(true);
    const copy = value.getGroupings();
    copy[0]?.types.push("unregistered");
    expect(value.getGrouping("clients").types).toEqual(["test", "post"]);
  });
  test("rejects duplicates and invalid types before extending any contributor", () => {
    const value = registry();
    expect(() =>
      value.registerGrouping({ ...clients, types: ["test", "missing"] }),
    ).toThrow();
    expect(value.getGroupings()).toEqual([]);
    expect(
      value.getEffectiveFrontmatterSchema("test")?.shape,
    ).not.toHaveProperty("clients");
    value.registerGrouping(clients);
    expect(() =>
      value.registerGrouping({ ...clients, label: "Other clients" }),
    ).toThrow();
  });
  test("preflights a complete declaration set without partially extending schemas", () => {
    const value = registry();
    expect(() =>
      value.validateGroupings([
        clients,
        { ...clients, key: "topics", field: "status" },
      ]),
    ).toThrow();
    expect(value.getGroupings()).toEqual([]);
    expect(
      value.getEffectiveFrontmatterSchema("post")?.shape,
    ).not.toHaveProperty("clients");
    expect(() => value.validateGroupings([clients, clients])).toThrow();
    value.validateGroupings([clients]);
    expect(value.getGroupings()).toEqual([]);
  });
  test("rejects owner-field collisions and reserved policy fields", () => {
    const value = registry();
    expect(() =>
      value.registerGrouping({ ...clients, field: "status" }),
    ).toThrow();
    expect(() =>
      value.registerGrouping({ ...clients, field: "visibility" }),
    ).toThrow();
    expect(() =>
      value.registerGrouping({ ...clients, field: "constructor" }),
    ).toThrow();
  });
  test("reuses an owner list field declared separately from its metadata", () => {
    const value = EntityRegistry.createFresh(createSilentLogger());
    // An adapter writes its frontmatter and metadata contracts separately, so
    // equal contracts are two objects. Reuse must compare them by shape.
    value.registerEntityType("reuse", reuseSchema, reuseAdapter);
    value.registerGrouping({ ...clients, types: ["reuse"] });
    expect(value.getGroupings()).toHaveLength(1);
    expect(
      value
        .getEffectiveFrontmatterSchema("reuse")
        ?.safeParse({ clients: ["Acme"] }).success,
    ).toBe(true);
  });
  test.each([
    [
      "array refinement",
      z
        .array(z.string())
        .refine((values) => values.every((value) => value === "Acme"))
        .optional(),
    ],
    [
      "element refinement",
      z.array(z.string().refine((value) => value === "Acme")).optional(),
    ],
    [
      "overwrite",
      z
        .array(z.string())
        .overwrite(() => ["Acme"])
        .optional(),
    ],
    [
      "transform",
      z
        .array(z.string())
        .transform(() => ["Acme"])
        .optional(),
    ],
  ])(
    "rejects a separately declared %s that JSON Schema cannot compare",
    (_name, field) => {
      const value = EntityRegistry.createFresh(createSilentLogger());
      const schema = reuseSchema.extend({
        metadata: z.object({ clients: field }),
      });
      value.registerEntityType("reuse", schema, reuseAdapter);
      expect(() =>
        value.registerGrouping({ ...clients, types: ["reuse"] }),
      ).toThrow("Cannot establish a shared frontmatter/metadata contract");
      expect(value.getGroupings()).toEqual([]);
    },
  );

  test("retains an existing extension's bounds and refinements", () => {
    const value = registry();
    value.extendFrontmatterSchema(
      "test",
      z.object({ clients: z.array(z.enum(["Acme", "Beta"])).max(1) }),
    );
    value.registerGrouping({ ...clients, types: ["test"] });
    const schema = value.getEffectiveFrontmatterSchema("test");
    expect(schema?.safeParse({ clients: ["Acme"] }).success).toBe(true);
    expect(schema?.safeParse({ clients: ["Unknown"] }).success).toBe(false);
    expect(schema?.safeParse({ clients: ["Acme", "Beta"] }).success).toBe(
      false,
    );
    expect(schema?.safeParse({}).success).toBe(false);
    expect(() =>
      value.extendFrontmatterSchema(
        "test",
        z.object({ clients: z.array(z.string()).optional() }),
      ),
    ).toThrow();
  });
});

describe("grouping projection", () => {
  function registry(): EntityRegistry {
    const value = EntityRegistry.createFresh(createSilentLogger());
    value.registerEntityType("strict", strictSchema, strictAdapter);
    value.registerGrouping({ ...clients, types: ["strict"] });
    return value;
  }
  const source = (frontmatter: string): string =>
    `---\n${frontmatter}\n---\n\nBody`;

  test("projects membership while an unrelated field is invalid", () => {
    const value = registry();
    // An invalid sibling belongs to its owner's validation, not to membership.
    expect(
      value.projectMetadata(
        "strict",
        source("status: bogus\nclients:\n  - Acme"),
        {},
      ),
    ).toEqual({ clients: ["Acme"] });
    expect(
      value.projectStoredMetadata(
        "strict",
        source("status: bogus\nclients:\n  - Acme"),
        {},
      ),
    ).toEqual({ clients: ["Acme"] });
  });

  test("rejects an invalid membership value on a write", () => {
    const value = registry();
    expect(() =>
      value.projectMetadata("strict", source("clients: 3"), {}),
    ).toThrow();
  });

  test("omits, rather than rejects, an invalid stored membership value", () => {
    const value = registry();
    expect(
      value.projectStoredMetadata("strict", source("clients: 3"), {
        clients: ["Stale"],
      }),
    ).toEqual({});
  });

  test("keeps one grouping's membership when another is invalid", () => {
    const value = registry();
    value.registerGrouping({
      key: "projects",
      label: "Projects",
      field: "projects",
      types: ["strict"],
    });
    expect(
      value.projectStoredMetadata(
        "strict",
        source("clients:\n  - Acme\nprojects: 7"),
        {},
      ),
    ).toEqual({ clients: ["Acme"] });
  });
});

describe("grouping queries (real SQLite)", () => {
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
    ctx.entityRegistry.registerGrouping(clients);
    await ctx.entityService.initialize();
  });
  afterEach(async () => {
    ctx.entityService.close();
    await ctx.cleanup();
  });
  async function add(
    id: string,
    values: string[],
    entityType = "test",
    visibility: ContentVisibility = "public",
    body = "Body",
  ): Promise<void> {
    await ctx.entityService.createEntity({
      entity: {
        id,
        entityType,
        visibility,
        content: `---\nclients: ${JSON.stringify(values)}\n---\n\n${body}`,
        metadata: {},
      },
    });
  }
  const query = { grouping: "clients", entityTypes: ["test", "post"] };
  test("counts distinct identities and supports multiple memberships", async () => {
    await add("same", ["Acme", "Acme", "Beta"]);
    await add("same", ["Acme"], "post");
    expect(await ctx.entityService.queryGroupingCatalog(query)).toEqual({
      values: [
        { value: "Acme", count: 2 },
        { value: "Beta", count: 1 },
      ],
      total: 2,
    });
    const result = await ctx.entityService.queryGroupingMembers({
      ...query,
      value: "Acme",
    });
    expect(result.total).toBe(2);
    expect(result.entities.map((e) => e.entityType).sort()).toEqual([
      "post",
      "test",
    ]);
  });
  test("scopes values and counts before pagination and cannot widen admitted types", async () => {
    await add("one", ["Acme"]);
    await add("two", ["Beta"], "post");
    await add("shared", ["Shared"], "test", "shared");
    await add("secret", ["Hidden"], "post", "restricted");
    expect(
      (
        await ctx.entityService.queryGroupingCatalog({
          ...query,
          entityTypes: ["test", "missing"],
          visibilityScope: "restricted",
        })
      ).values,
    ).toEqual([
      { value: "Acme", count: 1 },
      { value: "Shared", count: 1 },
    ]);
    expect(
      await ctx.entityService.queryGroupingCatalog({
        ...query,
        entityTypes: [],
      }),
    ).toEqual({ values: [], total: 0 });
    expect(
      await ctx.entityService.queryGroupingCatalog({
        ...query,
        limit: 1,
        offset: 1,
      }),
    ).toEqual({ values: [{ value: "Beta", count: 1 }], total: 2 });
    expect(
      (
        await ctx.entityService.queryGroupingCatalog({
          ...query,
          visibilityScope: "shared",
        })
      ).total,
    ).toBe(3);
    expect(
      (
        await ctx.entityService.queryGroupingMembers({
          ...query,
          value: "Hidden",
        })
      ).total,
    ).toBe(0);
  });
  test("matches exact values and preserves opaque IDs and values", async () => {
    await add("legacy\u0000:leaf", [
      "Acme",
      "\ufeffClient",
      "Client\u0000name",
    ]);
    await add("\ufeffid", ["acme"]);
    expect(
      (
        await ctx.entityService.queryGroupingMembers({
          ...query,
          value: "Acme",
        })
      ).entities.map((e) => e.id),
    ).toEqual(["legacy\u0000:leaf"]);
    expect(
      (await ctx.entityService.queryGroupingCatalog(query)).values.map(
        (entry) => entry.value,
      ),
      // Case-insensitive ordering keeps "Acme" beside "acme"; exact stored
      // bytes still break ties, and membership matching stays exact.
    ).toEqual(["Acme", "acme", "Client\u0000name", "\ufeffClient"]);
    expect(
      (
        await ctx.entityService.queryGroupingMembers({
          ...query,
          value: "acme",
        })
      ).entities.map((e) => e.id),
    ).toEqual(["\ufeffid"]);
  });
  test("ignores malformed containers and non-string elements without JSON errors", async () => {
    const db = createClient({ url: ctx.dbConfig.url });
    try {
      for (const [index, value] of [
        "Acme",
        null,
        true,
        3,
        {},
        [],
        ["Acme", { name: "Object" }, ["Nested"], null, 3],
      ].entries()) {
        await add(String(index), []);
        await db.execute({
          sql: "UPDATE entities SET metadata = ? WHERE id = ?",
          args: [JSON.stringify({ clients: value }), String(index)],
        });
      }
    } finally {
      db.close();
    }
    expect(await ctx.entityService.queryGroupingCatalog(query)).toEqual({
      values: [{ value: "Acme", count: 1 }],
      total: 1,
    });
    expect(
      (
        await ctx.entityService.queryGroupingMembers({
          ...query,
          value: "Acme",
        })
      ).total,
    ).toBe(1);
    expect(
      (
        await ctx.entityService.queryGroupingMembers({
          ...query,
          value: '["Nested"]',
        })
      ).total,
    ).toBe(0);
  });
  test("search is literal and members have stable sorting across types", async () => {
    await add("a", ["Acme"], "test", "public", "Needle%_");
    await add("b", ["Acme"], "post", "public", "NeedleXX");
    const result = await ctx.entityService.queryGroupingMembers({
      ...query,
      value: "Acme",
      q: "Needle%_",
    });
    expect(result.entities.map((e) => e.id)).toEqual(["a"]);
    expect(result.total).toBe(1);
  });
  test("enforces bounds, registered groupings, and cancellation", async () => {
    const invalid = await ctx.entityService
      .queryGroupingCatalog({ ...query, limit: 101 })
      .catch((error: unknown) => error);
    expect(invalid).toBeInstanceOf(z.ZodError);
    const missing = await ctx.entityService
      .queryGroupingCatalog({ ...query, grouping: "missing" })
      .catch((error: unknown) => error);
    expect(missing).toMatchObject({ message: "Unknown entity grouping" });
    const controller = new AbortController();
    controller.abort();
    const cancelled = await ctx.entityService
      .queryGroupingCatalog({ ...query, signal: controller.signal })
      .catch((error: unknown) => error);
    expect(cancelled).toBe(controller.signal.reason);
  });
});
