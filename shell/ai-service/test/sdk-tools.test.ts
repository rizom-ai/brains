import { describe, expect, it, mock } from "bun:test";
import { asSchema } from "@ai-sdk/provider-utils";
import { MCPService, type Tool } from "@brains/mcp-service";
import { createSilentLogger } from "@brains/test-utils";
import { z } from "@brains/utils/zod";
import { convertToSDKTools, toModelVisibleInputSchema } from "../src/sdk-tools";

describe("convertToSDKTools", () => {
  it("exposes source only for model-visible system_create source selection", () => {
    const tool: Tool = {
      name: "system_create",
      description: "Create",
      inputSchema: {
        entityType: z.string(),
        title: z.string().optional(),
        source: z
          .object({ kind: z.literal("text"), content: z.string() })
          .optional(),
        content: z.string().optional(),
        prompt: z.string().optional(),
        url: z.string().optional(),
        from: z.object({ kind: z.literal("conversation-message") }).optional(),
        upload: z
          .object({ kind: z.literal("upload"), id: z.string() })
          .optional(),
        transform: z.string().optional(),
        sourceAttachment: z
          .object({
            sourceEntityType: z.string(),
            sourceEntityId: z.string(),
            attachmentType: z.string(),
          })
          .optional(),
      },
      visibility: "public",
      handler: mock(async () => ({ success: true as const })),
    };

    const modelVisibleInputSchema = toModelVisibleInputSchema(
      tool.inputSchema,
      { toolName: "system_create" },
    );

    expect(Object.keys(modelVisibleInputSchema)).toEqual([
      "entityType",
      "title",
      "source",
    ]);
  });

  it("exposes upload preserve through system_create source", () => {
    const uploadRef = z.object({ kind: z.literal("upload"), id: z.string() });
    const runtimeSource = z.discriminatedUnion("kind", [
      z.object({ kind: z.literal("text"), content: z.string() }),
      z.object({
        kind: z.literal("upload"),
        upload: uploadRef,
        transform: z.enum(["extract-markdown", "preserve"]),
      }),
    ]);
    const createTool: Tool = {
      name: "system_create",
      description: "Create",
      inputSchema: {
        entityType: z.string(),
        source: runtimeSource,
        confirmed: z.literal(true).optional(),
        confirmationToken: z.string().optional(),
      },
      visibility: "trusted",
      handler: mock(async () => ({ success: true as const })),
    };
    const modelVisibleInputSchema = toModelVisibleInputSchema(
      createTool.inputSchema,
      { toolName: "system_create" },
    );
    expect(
      modelVisibleInputSchema["source"]?.safeParse({
        kind: "upload",
        upload: { kind: "upload", id: "upload-1" },
        transform: "preserve",
      }).success,
    ).toBe(true);
  });

  it("exposes structured scope as the only model-visible system_search scope selector", () => {
    const runtimeScope = z.discriminatedUnion("kind", [
      z.object({ kind: z.literal("all") }),
      z.object({ kind: z.literal("type"), entityType: z.string() }),
    ]);
    const tool: Tool = {
      name: "system_search",
      description: "Search",
      inputSchema: {
        query: z.string(),
        scope: runtimeScope,
        limit: z.number().optional(),
      },
      visibility: "public",
      handler: mock(async () => ({ success: true as const })),
    };

    const modelVisibleInputSchema = toModelVisibleInputSchema(
      tool.inputSchema,
      { toolName: "system_search" },
    );

    expect(Object.keys(modelVisibleInputSchema)).toEqual([
      "query",
      "scope",
      "limit",
    ]);
    expect(modelVisibleInputSchema["scope"]?.safeParse(undefined).success).toBe(
      false,
    );
    expect(
      modelVisibleInputSchema["scope"]?.safeParse({ kind: "all" }).success,
    ).toBe(true);
    expect(
      modelVisibleInputSchema["scope"]?.safeParse({
        kind: "type",
        entityType: "post",
      }).success,
    ).toBe(true);
  });

  it("exposes system_generate operation while hiding confirmation internals", async () => {
    const operation = z.discriminatedUnion("kind", [
      z.object({
        kind: z.literal("prompt"),
        entityType: z.string(),
        prompt: z.string(),
      }),
      z.object({
        kind: z.literal("prompt-from-source"),
        entityType: z.string(),
        source: z.object({ entityType: z.string(), entityId: z.string() }),
        prompt: z.string(),
      }),
      z.object({ kind: z.literal("standalone-image"), prompt: z.string() }),
      z.object({
        kind: z.literal("cover-image"),
        target: z.object({ entityType: z.string(), entityId: z.string() }),
        prompt: z.string(),
      }),
      z.object({
        kind: z.literal("attachment"),
        source: z.object({ entityType: z.string(), entityId: z.string() }),
        attachmentType: z.string(),
      }),
    ]);
    const tool: Tool = {
      name: "system_generate",
      description: "Generate",
      inputSchema: {
        operation,
        confirmed: z.literal(true).optional(),
        confirmationToken: z.string().optional(),
      },
      visibility: "trusted",
      handler: mock(async () => ({ success: true as const })),
    };

    const modelVisibleInputSchema = toModelVisibleInputSchema(
      tool.inputSchema,
      { toolName: "system_generate" },
    );

    expect(Object.keys(modelVisibleInputSchema)).toEqual(["operation"]);
    expect(
      modelVisibleInputSchema["operation"]?.safeParse({
        kind: "standalone-image",
        prompt: "Draw a robot",
      }).success,
    ).toBe(true);
    expect(
      modelVisibleInputSchema["operation"]?.safeParse({
        kind: "attachment",
        source: { entityType: "deck", entityId: "deck-1" },
        attachmentType: "carousel",
      }).success,
    ).toBe(true);

    const serialized = z
      .object({ properties: z.record(z.unknown()).optional() })
      .passthrough()
      .parse(await asSchema(z.object(modelVisibleInputSchema)).jsonSchema);
    const operationSchema = z
      .object({
        anyOf: z.array(z.unknown()).optional(),
        oneOf: z.array(z.unknown()).optional(),
      })
      .passthrough()
      .parse(serialized.properties?.["operation"]);
    const alternatives = operationSchema.anyOf ?? operationSchema.oneOf;
    expect(alternatives?.length).toBe(5);
    expect(JSON.stringify(operationSchema)).toContain(
      '"const":"prompt-from-source"',
    );
    expect(JSON.stringify(operationSchema)).toContain('"const":"attachment"');
  });

  it("keeps attachment URLs out of model-visible generated artifact output", async () => {
    const tool: Tool = {
      name: "system_generate",
      description: "Generate document",
      inputSchema: { source: z.object({ sourceEntityId: z.string() }) },
      visibility: "public",
      handler: mock(
        async (): Promise<{ success: true; data: unknown }> => ({
          success: true,
          data: {
            jobId: "job-1",
            documentId: "deck-carousel",
            attachment: {
              mediaType: "application/pdf",
              url: "/api/chat/attachments/document?id=deck-carousel",
              downloadUrl:
                "/api/chat/attachments/document?id=deck-carousel&download=1",
              filename: "deck-carousel.pdf",
              source: {
                entityType: "document",
                entityId: "deck-carousel",
                attachmentType: "carousel",
              },
            },
          },
        }),
      ),
    };

    const sdkTool = convertToSDKTools(
      [tool],
      { conversationId: "conversation-1", interfaceType: "agent" },
      { emit: mock(() => {}) },
    )["system_generate"];
    if (!sdkTool?.execute || !sdkTool.toModelOutput) {
      throw new Error("Expected system_generate to be executable");
    }

    const input = { source: { sourceEntityId: "deck-1" } };
    const result = await sdkTool.execute(input, {
      toolCallId: "call-1",
      messages: [],
    });
    const modelOutput = await sdkTool.toModelOutput({
      toolCallId: "call-1",
      input,
      output: result,
    });

    expect(JSON.stringify(result)).toContain(
      "/api/chat/attachments/document?id=deck-carousel&download=1",
    );
    expect(JSON.stringify(modelOutput)).not.toContain("/api/chat/attachments");
    expect(modelOutput).toEqual({
      type: "json",
      value: {
        success: true,
        data: {
          jobId: "job-1",
          documentId: "deck-carousel",
          attachment: {
            mediaType: "application/pdf",
            filename: "deck-carousel.pdf",
            source: {
              entityType: "document",
              entityId: "deck-carousel",
              attachmentType: "carousel",
            },
          },
          artifactCard: {
            rendered: true,
            message:
              "The UI has rendered this artifact as an attachment card with Open and Download controls. Do not print raw attachment URLs in the assistant response.",
          },
        },
      },
    });
  });

  it("deduplicates identical pure read tool calls within one converted tool set", async () => {
    const handler = mock(async (_args: unknown) => ({
      success: true as const,
      data: { entity: { id: "deck-1", entityType: "deck", metadata: {} } },
    }));
    const tool: Tool = {
      name: "system_get",
      description: "Get entity",
      inputSchema: { entityType: z.string(), id: z.string() },
      visibility: "public",
      sideEffects: "none",
      handler,
    };

    const sdkTool = convertToSDKTools(
      [tool],
      { conversationId: "conversation-1", interfaceType: "agent" },
      { emit: mock(() => {}) },
    )["system_get"];
    if (!sdkTool?.execute) throw new Error("Expected system_get to execute");

    const first = await sdkTool.execute(
      { entityType: "deck", id: "deck-1" },
      { toolCallId: "call-1", messages: [] },
    );
    const second = await sdkTool.execute(
      { entityType: "deck", id: "deck-1" },
      { toolCallId: "call-2", messages: [] },
    );

    expect(first).toEqual({
      success: true,
      data: { entity: { id: "deck-1", entityType: "deck", metadata: {} } },
    });
    expect(second).toEqual({
      success: true,
      data: { entity: { id: "deck-1", entityType: "deck", metadata: {} } },
      cached: true,
    });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("does not deduplicate write tool calls", async () => {
    const handler = mock(async () => ({ success: true as const }));
    const tool: Tool = {
      name: "system_create",
      description: "Create entity",
      inputSchema: { entityType: z.string(), title: z.string() },
      visibility: "public",
      sideEffects: "writes",
      handler,
    };

    const sdkTool = convertToSDKTools(
      [tool],
      { conversationId: "conversation-1", interfaceType: "agent" },
      { emit: mock(() => {}) },
    )["system_create"];
    if (!sdkTool?.execute) throw new Error("Expected system_create to execute");

    await sdkTool.execute(
      { entityType: "note", title: "A" },
      { toolCallId: "call-1", messages: [] },
    );
    await sdkTool.execute(
      { entityType: "note", title: "A" },
      { toolCallId: "call-2", messages: [] },
    );

    expect(handler).toHaveBeenCalledTimes(2);
  });

  it("invalidates turn read cache after write tools execute", async () => {
    let version = 1;
    const getHandler = mock(async () => ({
      success: true as const,
      data: {
        entity: {
          id: "note-1",
          entityType: "note",
          metadata: { version: String(version) },
        },
      },
    }));
    const updateHandler = mock(async () => {
      version = 2;
      return { success: true as const, data: { updated: "note-1" } };
    });
    const getTool: Tool = {
      name: "system_get",
      description: "Get entity",
      inputSchema: { entityType: z.string(), id: z.string() },
      visibility: "public",
      sideEffects: "none",
      handler: getHandler,
    };
    const updateTool: Tool = {
      name: "system_update",
      description: "Update entity",
      inputSchema: { entityType: z.string(), id: z.string() },
      visibility: "public",
      sideEffects: "writes",
      handler: updateHandler,
    };

    const sdkTools = convertToSDKTools(
      [getTool, updateTool],
      { conversationId: "conversation-1", interfaceType: "agent" },
      { emit: mock(() => {}) },
    );
    const getSdkTool = sdkTools["system_get"];
    const updateSdkTool = sdkTools["system_update"];
    if (!getSdkTool?.execute || !updateSdkTool?.execute) {
      throw new Error("Expected tools to execute");
    }

    const first = await getSdkTool.execute(
      { entityType: "note", id: "note-1" },
      { toolCallId: "call-1", messages: [] },
    );
    await updateSdkTool.execute(
      { entityType: "note", id: "note-1" },
      { toolCallId: "call-2", messages: [] },
    );
    const second = await getSdkTool.execute(
      { entityType: "note", id: "note-1" },
      { toolCallId: "call-3", messages: [] },
    );

    expect(first).not.toEqual(second);
    expect(JSON.stringify(second)).toContain('"version":"2"');
    expect(getHandler).toHaveBeenCalledTimes(2);
  });

  it("passes coerced invalid registered tool responses through normal agent tool execution", async () => {
    const unsubscribeFn = mock(() => {});
    const mcpService = MCPService.createFresh(
      {
        send: mock(async () => ({ success: true as const })),
        subscribe: mock(() => unsubscribeFn),
        unsubscribe: mock(() => {}),
      },
      createSilentLogger(),
    );
    const invalidHandler = mock(async () => JSON.parse('{"success":false}'));
    const tool: Tool = {
      name: "invalid_tool",
      description: "Invalid tool",
      inputSchema: { value: z.string() },
      visibility: "public",
      handler: invalidHandler,
    };

    mcpService.registerTool("test", tool);

    const sdkTools = convertToSDKTools(
      mcpService
        .listToolsForPermissionLevel("public")
        .map((entry) => entry.tool),
      {
        conversationId: "conversation-1",
        interfaceType: "agent",
        userPermissionLevel: "public",
      },
      { emit: mock(() => {}) },
    );

    const sdkTool = sdkTools["invalid_tool"];
    expect(sdkTool?.execute).toBeDefined();
    if (!sdkTool?.execute) {
      throw new Error("Expected invalid_tool to be executable");
    }

    const result = await sdkTool.execute(
      { value: "x" },
      { toolCallId: "call-1", messages: [] },
    );
    expect(result).toEqual({
      success: false,
      error: "Tool invalid_tool returned an invalid response shape",
    });
    expect(invalidHandler).toHaveBeenCalledWith(
      { value: "x" },
      expect.objectContaining({
        interfaceType: "agent",
        userId: "agent-user",
        conversationId: "conversation-1",
        toolCallId: "call-1",
        userPermissionLevel: "public",
      }),
    );
  });
});

describe("toModelVisibleInputSchema", () => {
  it("hides internal confirmation fields from model-visible tool schemas", () => {
    const inputSchema = toModelVisibleInputSchema({
      entityType: z.string(),
      id: z.string(),
      confirmed: z.literal(true).optional(),
      confirmationToken: z.string().optional(),
      contentHash: z.string().optional(),
    });

    expect(Object.keys(inputSchema)).toEqual(["entityType", "id"]);
  });
});
