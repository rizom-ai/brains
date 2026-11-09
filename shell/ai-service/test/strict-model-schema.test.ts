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
