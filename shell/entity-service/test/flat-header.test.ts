import { describe, expect, it } from "bun:test";
import { createSilentLogger } from "@brains/test-utils";
import { z } from "@brains/utils/zod";
import { BaseEntityAdapter } from "../src/adapters/base-entity-adapter";
import { EntityRegistry } from "../src/entityRegistry";
import { nestedHeaderValueKeys } from "../src/flat-header";
import { baseEntitySchema, type BaseEntity } from "../src/types";

/**
 * A markdown file's header is flat (docs/plans/one-stored-form.md, Rule):
 * scalars and lists of scalars, so Obsidian shows every key as a property
 * and a reader never meets an object it cannot edit. A type whose header
 * nests is refused when it registers; a YAML file's header may nest.
 */
class HeaderAdapter extends BaseEntityAdapter<BaseEntity> {
  constructor(header: z.ZodObject<z.ZodRawShape>) {
    super({
      entityType: "item",
      purpose: "A test item.",
      schema: baseEntitySchema,
      frontmatterSchema: header,
    });
  }

  public fromMarkdown(): Partial<BaseEntity> {
    return {};
  }

  public override toMarkdown(entity: BaseEntity): string {
    return entity.content;
  }
}

function register(
  header: z.ZodObject<z.ZodRawShape>,
  storage?: "yaml",
): EntityRegistry {
  const registry = EntityRegistry.createFresh(createSilentLogger());
  registry.registerEntityType(
    "item",
    baseEntitySchema,
    new HeaderAdapter(header),
    storage ? { storage } : undefined,
  );
  return registry;
}

describe("a type's header", () => {
  it("registers flat: scalars and lists of scalars", () => {
    expect(() =>
      register(
        z.object({
          title: z.string(),
          count: z.number().optional(),
          tags: z.array(z.string()).default([]),
          kind: z.enum(["a", "b"]).optional(),
        }),
      ),
    ).not.toThrow();
  });

  it("counts text in any format as a scalar", () => {
    expect(() =>
      register(
        z.object({
          receivedAt: z.iso.datetime(),
          email: z.email().optional(),
          links: z.array(z.url()).default([]),
          dueDate: z.coerce.date().nullable(),
        }),
      ),
    ).not.toThrow();
  });

  it.each([
    ["an object", z.object({ cta: z.object({ heading: z.string() }) })],
    ["a record", z.object({ sections: z.record(z.string(), z.string()) })],
    [
      "a list of objects",
      z.object({ source: z.array(z.object({ url: z.string() })).optional() }),
    ],
  ])("is refused with %s in it, naming the key", (_kind, header) => {
    expect(() => register(header)).toThrow(/item.*(cta|sections|source)/);
  });

  it("may nest in a YAML file", () => {
    expect(() =>
      register(
        z.object({ groupings: z.record(z.string(), z.object({})) }),
        "yaml",
      ),
    ).not.toThrow();
  });

  it("refuses an extension that would nest it", () => {
    const registry = register(z.object({ title: z.string() }));
    expect(() =>
      registry.extendFrontmatterSchema(
        "item",
        z.object({ meta: z.object({ a: z.string() }) }),
      ),
    ).toThrow(/item.*meta/);
  });
});

describe("a written header's values", () => {
  it("are flat: scalars and lists of scalars", () => {
    expect(
      nestedHeaderValueKeys({
        title: "One",
        count: 2,
        tags: ["a", "b"],
        due: null,
        pinned: true,
      }),
    ).toEqual([]);
  });

  it("nest in an object or a list of objects", () => {
    expect(
      nestedHeaderValueKeys({
        title: "One",
        source: { ref: "x" },
        documents: [{ id: "a" }],
        mixed: ["a", { id: "b" }],
      }),
    ).toEqual(["source", "documents", "mixed"]);
  });
});
