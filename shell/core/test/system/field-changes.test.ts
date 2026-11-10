import { describe, expect, it, mock } from "bun:test";
import { z } from "@brains/utils/zod";
import {
  fieldChangeListSchema,
  fieldsFromChanges,
} from "../../src/system/field-changes";
import { createSystemTools } from "../../src/system/tools";
import { createMockSystemServices } from "./mock-services";

/** The editable fields of two entity types: one shared, others their own. */
const editable: Record<string, z.ZodObject> = {
  post: z.object({
    title: z.string(),
    status: z.enum(["draft", "published"]),
    publishedAt: z.string().optional(),
    coverImageId: z.string().optional(),
    visibility: z.enum(["public", "shared"]).optional(),
  }),
  topic: z.object({
    title: z.string(),
    status: z.enum(["draft", "published"]),
    aliases: z.record(z.string(), z.unknown()).optional(),
  }),
};

/** A frontmatter field the brain keeps for itself, not editable. */
const internal = { cardCid: z.string().optional() };

const registry = {
  ensureGroupingsCurrent: mock(async (): Promise<void> => {}),
  getAllEntityTypes: (): string[] => Object.keys(editable),
  getEffectiveFrontmatterSchema: (type: string): z.ZodObject | undefined =>
    editable[type]?.extend(internal),
  getEditableFieldsSchema: (type: string): z.ZodObject | undefined =>
    editable[type],
  // A post also takes, on create alone, where its sections break.
  getCreateFieldsSchema: (type: string): z.ZodObject | undefined =>
    type === "post"
      ? editable["post"]?.extend({ layout: z.enum(["wide", "narrow"]) })
      : editable[type],
};

function jsonOf(schema: z.ZodType): unknown {
  const { $schema: _draft, ...json }: Record<string, unknown> = z.toJSONSchema(
    schema,
    { target: "draft-7", io: "input" },
  );
  return json;
}

describe("a list of field changes", () => {
  it("offers each frontmatter field once, typed by the field", () => {
    const list = fieldChangeListSchema(registry, { on: "create" });

    expect(
      list.safeParse([{ name: "status", value: "published" }]).success,
    ).toBe(true);
    expect(
      list.safeParse([{ name: "status", value: "archived" }]).success,
    ).toBe(false);
    expect(
      list.safeParse([{ name: "publishedAt", value: "2025-03-12" }]).success,
    ).toBe(true);
    expect(list.safeParse([{ name: "unknown", value: "x" }]).success).toBe(
      false,
    );
  });

  it("removes a field with null only where a field can be removed", () => {
    const remove = [{ name: "coverImageId", value: null }];

    expect(
      fieldChangeListSchema(registry, { on: "update" }).safeParse(remove)
        .success,
    ).toBe(true);
    expect(
      fieldChangeListSchema(registry, { on: "create" }).safeParse(remove)
        .success,
    ).toBe(false);
  });

  it("leaves out a field the brain keeps, one the caller sets elsewhere, and one of any keys", () => {
    const names = JSON.stringify(
      jsonOf(
        fieldChangeListSchema(registry, {
          on: "create",
          omit: ["visibility"],
        }),
      ),
    );

    expect(names).not.toContain('"visibility"');
    expect(names).not.toContain('"aliases"');
    expect(names).not.toContain('"cardCid"');
    expect(names).toContain('"publishedAt"');
  });

  it("writes fields of the same value type once, naming each", () => {
    const json = JSON.stringify(
      jsonOf(fieldChangeListSchema(registry, { on: "create" })),
    );

    // title, publishedAt and coverImageId are all text: one branch names them.
    expect(json).toContain('"enum":["title","publishedAt","coverImageId"]');
    expect(
      fieldChangeListSchema(registry, { on: "create" }).safeParse([
        { name: "coverImageId", value: "image-1" },
      ]).success,
    ).toBe(true);
  });

  it("names the entity types that take each field", () => {
    const json = JSON.stringify(
      jsonOf(fieldChangeListSchema(registry, { on: "create" })),
    );

    expect(json).toContain("title (every type)");
    expect(json).toContain("publishedAt (post)");
  });

  it("becomes the map of fields a tool takes", () => {
    expect(
      fieldsFromChanges([
        { name: "status", value: "published" },
        { name: "coverImageId", value: null },
      ]),
    ).toEqual({ status: "published", coverImageId: null });
  });
});

function toolNamed(name: string): ReturnType<typeof createSystemTools>[number] {
  const services = createMockSystemServices();
  const tool = createSystemTools({
    ...services,
    entityRegistry: { ...services.entityRegistry, ...registry },
  }).find((candidate) => candidate.name === name);
  if (!tool?.modelInput) throw new Error(`${name} has no model input`);
  return tool;
}

describe("system_create's model input", () => {
  it("takes field changes for the entity and for each uploaded file", () => {
    const { modelInput } = toolNamed("system_create");
    if (!modelInput) throw new Error("Expected a model input");

    expect(
      modelInput.toToolInput({
        entityType: "post",
        fields: [{ name: "status", value: "published" }],
        source: {
          kind: "uploads",
          items: [
            {
              id: "upload-1",
              transform: "extract-markdown",
              fields: [{ name: "publishedAt", value: "2025-03-12" }],
            },
            { id: "upload-2", transform: "extract-markdown" },
          ],
        },
      }),
    ).toEqual({
      entityType: "post",
      fields: { status: "published" },
      source: {
        kind: "uploads",
        items: [
          {
            id: "upload-1",
            transform: "extract-markdown",
            fields: { publishedAt: "2025-03-12" },
          },
          { id: "upload-2", transform: "extract-markdown" },
        ],
      },
    });
  });

  it("shows the model field changes, not a map of any keys", () => {
    const { modelInput } = toolNamed("system_create");
    if (!modelInput) throw new Error("Expected a model input");

    const json = JSON.stringify(jsonOf(z.object(modelInput.inputSchema())));
    expect(json).not.toContain('"propertyNames"');
    expect(json).toContain('"publishedAt"');
  });
});

describe("a field a type takes only on create", () => {
  const shown = (name: string): string => {
    const { modelInput } = toolNamed(name);
    if (!modelInput) throw new Error("Expected a model input");
    return JSON.stringify(jsonOf(z.object(modelInput.inputSchema())));
  };

  it("is offered on create", () => {
    expect(shown("system_create")).toContain('"layout"');
  });

  it("is not offered on update", () => {
    expect(shown("system_update")).not.toContain('"layout"');
  });
});

describe("system_update's model input", () => {
  it("takes field changes, a null removing the field", () => {
    const { modelInput } = toolNamed("system_update");
    if (!modelInput) throw new Error("Expected a model input");

    expect(
      modelInput.toToolInput({
        entityType: "post",
        id: "on-patience",
        operation: { fields: [{ name: "coverImageId", value: null }] },
      }),
    ).toEqual({
      entityType: "post",
      id: "on-patience",
      operation: { fields: { coverImageId: null } },
    });
  });
});

describe("system_update's model operation", () => {
  const operation = (): z.core.$ZodType => {
    const { modelInput } = toolNamed("system_update");
    if (!modelInput) throw new Error("Expected a model input");
    const schema = modelInput.inputSchema()["operation"];
    if (!schema) throw new Error("Expected an operation");
    return schema;
  };

  it("is one operation alone, as strict mode writes every key it shows", () => {
    expect(
      z.safeParse(operation(), {
        edits: [{ oldText: "monthly", newText: "weekly" }],
      }).success,
    ).toBe(true);
    expect(
      z.safeParse(operation(), {
        fields: [],
        edits: [{ oldText: "monthly", newText: "weekly" }],
      }).success,
    ).toBe(false);
  });

  it("is shown as one closed shape per operation", () => {
    const json = z.toJSONSchema(operation(), {
      target: "draft-7",
      io: "input",
    });
    const shapes = z
      .object({ anyOf: z.array(z.object({ required: z.array(z.string()) })) })
      .parse(json).anyOf;
    expect(shapes.map((shape) => shape.required)).toEqual([
      ["fields"],
      ["content"],
      ["edits"],
      ["source"],
    ]);
  });
});

describe("a field list read from the brain's state", () => {
  it.each(["system_create", "system_update"])(
    "has %s read the current groupings before it is shown",
    async (name) => {
      registry.ensureGroupingsCurrent.mockClear();
      const { modelInput } = toolNamed(name);

      await modelInput?.prepare?.();

      expect(registry.ensureGroupingsCurrent).toHaveBeenCalledTimes(1);
    },
  );
});
