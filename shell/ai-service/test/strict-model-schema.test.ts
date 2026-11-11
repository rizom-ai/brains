import { describe, expect, it, mock } from "bun:test";
import { asSchema } from "@ai-sdk/provider-utils";
import type { Tool } from "@brains/mcp-service";
import { z } from "@brains/utils/zod";
import { convertToSDKTools } from "../src/sdk-tools";
import {
  dropModelNulls,
  toStrictModelSchema,
} from "../src/strict-model-schema";

function jsonOf(schema: z.ZodType): Record<string, unknown> {
  const { $schema: _draft, ...json }: Record<string, unknown> = z.toJSONSchema(
    schema,
    { target: "draft-7", io: "input" },
  );
  return json;
}

describe("a tool's strict model schema", () => {
  it("lists every property, an optional one accepting null, and closes the object", () => {
    expect(
      toStrictModelSchema(
        jsonOf(z.object({ title: z.string(), id: z.string().optional() })),
      ),
    ).toEqual({
      type: "object",
      properties: {
        title: { type: "string" },
        id: { anyOf: [{ type: "string" }, { type: "null" }] },
      },
      required: ["title", "id"],
      additionalProperties: false,
    });
  });

  it("keeps a field that already accepts null as it is", () => {
    expect(
      toStrictModelSchema(
        jsonOf(z.object({ note: z.string().nullable().optional() })),
      ),
    ).toEqual({
      type: "object",
      properties: { note: { anyOf: [{ type: "string" }, { type: "null" }] } },
      required: ["note"],
      additionalProperties: false,
    });
  });

  it("writes a discriminated union's branches as anyOf, each closed", () => {
    expect(
      toStrictModelSchema(
        jsonOf(
          z.object({
            scope: z.discriminatedUnion("kind", [
              z.object({ kind: z.literal("all") }),
              z.object({ kind: z.literal("type"), entityType: z.string() }),
            ]),
          }),
        ),
      ),
    ).toEqual({
      type: "object",
      properties: {
        scope: {
          anyOf: [
            {
              type: "object",
              properties: { kind: { type: "string", const: "all" } },
              required: ["kind"],
              additionalProperties: false,
            },
            {
              type: "object",
              properties: {
                kind: { type: "string", const: "type" },
                entityType: { type: "string" },
              },
              required: ["kind", "entityType"],
              additionalProperties: false,
            },
          ],
        },
      },
      required: ["scope"],
      additionalProperties: false,
    });
  });

  it("closes the objects inside an array", () => {
    expect(
      toStrictModelSchema(
        jsonOf(
          z.object({
            edits: z.array(
              z.object({ oldText: z.string(), note: z.string().optional() }),
            ),
          }),
        ),
      ),
    ).toEqual({
      type: "object",
      properties: {
        edits: {
          type: "array",
          items: {
            type: "object",
            properties: {
              oldText: { type: "string" },
              note: { anyOf: [{ type: "string" }, { type: "null" }] },
            },
            required: ["oldText", "note"],
            additionalProperties: false,
          },
        },
      },
      required: ["edits"],
      additionalProperties: false,
    });
  });

  it("keeps a string format strict mode supports and drops one it does not", () => {
    expect(
      toStrictModelSchema(
        jsonOf(z.object({ url: z.url(), at: z.iso.datetime() })),
      ),
    ).toMatchObject({
      properties: {
        url: { type: "string" },
        at: { type: "string", format: "date-time" },
      },
    });
    expect(
      JSON.stringify(toStrictModelSchema(jsonOf(z.object({ url: z.url() })))),
    ).not.toContain('"format"');
  });

  it("leaves a field's default value as it is", () => {
    // A default is a value, not a schema: one shaped like an object schema
    // is still written as the value it is.
    const strict = toStrictModelSchema(
      jsonOf(
        z.object({
          layout: z.object({ type: z.string() }).default({ type: "object" }),
        }),
      ),
    );

    const layout = z
      .object({
        properties: z.object({
          layout: z.object({
            anyOf: z.tuple([
              z.looseObject({ default: z.unknown() }),
              z.unknown(),
            ]),
          }),
        }),
      })
      .parse(strict).properties.layout;
    expect(layout.anyOf[0].default).toEqual({ type: "object" });
  });

  it.each([
    ["a map of any keys", z.record(z.string(), z.unknown())],
    ["an object that keeps unknown keys", z.looseObject({ a: z.string() })],
  ])("is not written for %s, which strict mode cannot express", (_, field) => {
    expect(toStrictModelSchema(jsonOf(z.object({ field })))).toBeUndefined();
  });
});

describe("a schema written once and referred to twice", () => {
  const change = z.strictObject({
    name: z.literal("title"),
    note: z.string().optional(),
  });
  const json = (): Record<string, unknown> => {
    const { $schema: _draft, ...rest }: Record<string, unknown> =
      z.toJSONSchema(
        z.object({
          fields: z.array(change).optional(),
          items: z.array(z.object({ fields: z.array(change).optional() })),
        }),
        { target: "draft-7", io: "input", reused: "ref" },
      );
    return rest;
  };

  it("stays one definition, referred to without allOf", () => {
    const strict = JSON.stringify(toStrictModelSchema(json()));

    expect(strict).toContain('"$ref":"#/definitions/');
    expect(strict).not.toContain('"allOf"');
    expect(strict.split('"const":"title"').length - 1).toBe(1);
  });

  it("is referred to alone, its description and default kept beside it", () => {
    expect(
      toStrictModelSchema({
        type: "object",
        properties: {
          action: {
            $ref: "#/definitions/action",
            description: "What to do",
            default: "sync",
          },
        },
        required: ["action"],
        definitions: { action: { type: "string", enum: ["sync", "status"] } },
      }),
    ).toEqual({
      type: "object",
      properties: {
        action: {
          anyOf: [{ $ref: "#/definitions/action" }],
          description: "What to do",
          default: "sync",
        },
      },
      required: ["action"],
      additionalProperties: false,
      definitions: { action: { type: "string", enum: ["sync", "status"] } },
    });
  });

  it("has a null the model writes inside it dropped", () => {
    expect(
      dropModelNulls(
        {
          fields: [{ name: "title", note: null }],
          items: [{ fields: [{ name: "title", note: null }] }],
        },
        json(),
      ),
    ).toEqual({
      fields: [{ name: "title" }],
      items: [{ fields: [{ name: "title" }] }],
    });
  });
});

describe("a null the model sends for a field it leaves out", () => {
  const original = jsonOf(
    z.object({
      title: z.string(),
      id: z.string().optional(),
      note: z.string().nullable().optional(),
      scope: z.discriminatedUnion("kind", [
        z.object({ kind: z.literal("all"), limit: z.number().optional() }),
        z.object({ kind: z.literal("type"), entityType: z.string() }),
      ]),
    }),
  );

  it("is dropped, while a null the field accepts stays", () => {
    expect(
      dropModelNulls(
        {
          title: "Plan",
          id: null,
          note: null,
          scope: { kind: "all", limit: null },
        },
        original,
      ),
    ).toEqual({ title: "Plan", note: null, scope: { kind: "all" } });
  });
});

function createTool(inputSchema: Tool["inputSchema"]): Tool {
  return {
    name: "publishing_manage",
    description: "Publish an entity.",
    inputSchema,
    visibility: "public",
    handler: mock(async () => ({ success: true as const, data: {} })),
  };
}

const context = { conversationId: "c", interfaceType: "agent" };
const emitter = { emit: (): void => {} };

describe("a converted tool", () => {
  it("is sent strict with its strict schema, and runs without the nulls", async () => {
    const tool = createTool({
      entityType: z.string(),
      id: z.string().optional(),
    });
    const sdkTool = convertToSDKTools([tool], context, emitter, {
      strictTools: true,
    })["publishing_manage"];
    if (!sdkTool?.execute) throw new Error("Expected an executable tool");

    expect(sdkTool.strict).toBe(true);
    expect(await asSchema(sdkTool.inputSchema).jsonSchema).toMatchObject({
      required: ["entityType", "id"],
      additionalProperties: false,
    });
    const validated = await asSchema(sdkTool.inputSchema).validate?.({
      entityType: "post",
      id: null,
    });
    expect(validated).toEqual({ success: true, value: { entityType: "post" } });
  });

  it("keeps a tool with an open map as it is, not strict", async () => {
    const tool = createTool({
      entityType: z.string(),
      fields: z.record(z.string(), z.unknown()).optional(),
    });
    const sdkTool = convertToSDKTools([tool], context, emitter, {
      strictTools: true,
    })["publishing_manage"];

    if (!sdkTool) throw new Error("Expected the converted tool");
    expect(sdkTool.strict).toBeUndefined();
    expect(await asSchema(sdkTool.inputSchema).jsonSchema).toMatchObject({
      required: ["entityType"],
    });
  });

  it("is sent as it is when its model takes no strict tools", async () => {
    const tool = createTool({
      entityType: z.string(),
      id: z.string().optional(),
    });
    const sdkTool = convertToSDKTools([tool], context, emitter)[
      "publishing_manage"
    ];

    if (!sdkTool) throw new Error("Expected the converted tool");
    expect(sdkTool.strict).toBeUndefined();
    expect(await asSchema(sdkTool.inputSchema).jsonSchema).toMatchObject({
      required: ["entityType"],
    });
  });
});

describe("a tool with its own model input", () => {
  // The model writes field changes as a list; the tool takes them as a map.
  const fieldChange = z.union([
    z.strictObject({
      name: z.literal("status"),
      value: z.enum(["draft", "published"]),
    }),
    z.strictObject({
      name: z.literal("coverImageId"),
      value: z.string().nullable(),
    }),
  ]);
  const tool: Tool = {
    ...createTool({
      entityType: z.string(),
      fields: z.record(z.string(), z.unknown()).optional(),
    }),
    modelInput: {
      inputSchema: () => ({
        entityType: z.string(),
        fields: z.array(fieldChange).optional(),
      }),
      toToolInput: ({ fields, ...input }) => ({
        ...input,
        ...(Array.isArray(fields) && {
          fields: Object.fromEntries(
            fields.map((change) => [change.name, change.value]),
          ),
        }),
      }),
    },
  };

  it("is shown to the model in its own shape, strict", async () => {
    const sdkTool = convertToSDKTools([tool], context, emitter, {
      strictTools: true,
    })["publishing_manage"];
    if (!sdkTool) throw new Error("Expected the converted tool");

    expect(sdkTool.strict).toBe(true);
    expect(await asSchema(sdkTool.inputSchema).jsonSchema).toMatchObject({
      properties: { fields: { anyOf: [{ type: "array" }, { type: "null" }] } },
    });
  });

  it("runs on the tool's own input, a removal kept", async () => {
    const sdkTool = convertToSDKTools([tool], context, emitter, {
      strictTools: true,
    })["publishing_manage"];
    if (!sdkTool) throw new Error("Expected the converted tool");

    expect(
      await asSchema(sdkTool.inputSchema).validate?.({
        entityType: "post",
        fields: [
          { name: "status", value: "published" },
          { name: "coverImageId", value: null },
        ],
      }),
    ).toEqual({
      success: true,
      value: {
        entityType: "post",
        fields: { status: "published", coverImageId: null },
      },
    });
  });

  it("is not shown to a model without strict tools, which writes the tool's own input", async () => {
    const sdkTool = convertToSDKTools([tool], context, emitter)[
      "publishing_manage"
    ];
    if (!sdkTool) throw new Error("Expected the converted tool");

    expect(await asSchema(sdkTool.inputSchema).jsonSchema).toMatchObject({
      properties: { fields: { type: "object" } },
    });
    expect(
      await asSchema(sdkTool.inputSchema).validate?.({
        entityType: "post",
        fields: { status: "published" },
      }),
    ).toEqual({
      success: true,
      value: { entityType: "post", fields: { status: "published" } },
    });
  });

  it("refuses a change the model input has no form for", async () => {
    const sdkTool = convertToSDKTools([tool], context, emitter, {
      strictTools: true,
    })["publishing_manage"];
    if (!sdkTool) throw new Error("Expected the converted tool");

    const validated = await asSchema(sdkTool.inputSchema).validate?.({
      entityType: "post",
      fields: [{ name: "status", value: "archived" }],
    });
    expect(validated?.success).toBe(false);
  });
});

describe("a null the model sends inside one branch of a union", () => {
  // Each branch is used twice, so each is written once and referred to.
  const text = z.strictObject({ kind: z.literal("text"), text: z.string() });
  const uploads = z.strictObject({
    kind: z.literal("uploads"),
    items: z.array(
      z.strictObject({ id: z.string(), title: z.string().optional() }),
    ),
  });
  const schema = (): Record<string, unknown> => {
    const { $schema: _draft, ...rest }: Record<string, unknown> =
      z.toJSONSchema(
        z.object({
          source: z.discriminatedUnion("kind", [text, uploads]),
          fallback: z.discriminatedUnion("kind", [text, uploads]).optional(),
        }),
        { target: "draft-7", io: "input", reused: "ref" },
      );
    return rest;
  };

  it("is dropped in the branch the value names, each branch referred to", () => {
    expect(JSON.stringify(schema())).toContain('"oneOf":[{"$ref"');
    expect(
      dropModelNulls(
        {
          source: { kind: "uploads", items: [{ id: "a", title: null }] },
          fallback: null,
        },
        schema(),
      ),
    ).toEqual({ source: { kind: "uploads", items: [{ id: "a" }] } });
  });

  it("is dropped in the one closed branch that has the value's keys", () => {
    expect(
      dropModelNulls(
        { operation: { edits: ["x"], note: null } },
        jsonOf(
          z.object({
            operation: z.union([
              // Read against this branch, the null would stay.
              z.strictObject({
                fields: z.array(z.string()),
                note: z.string().nullable().optional(),
              }),
              z.strictObject({
                edits: z.array(z.string()),
                note: z.string().optional(),
              }),
            ]),
          }),
        ),
      ),
    ).toEqual({ operation: { edits: ["x"] } });
  });
});
