import { describe, expect, it, mock } from "bun:test";
import { MCPService, type Tool } from "@brains/mcp-service";
import { createSilentLogger } from "@brains/test-utils";
import { z } from "@brains/utils";
import { convertToSDKTools, toModelVisibleInputSchema } from "../src/sdk-tools";

describe("convertToSDKTools", () => {
  it("exposes create source fields only when enabled for the current turn", () => {
    const tool: Tool = {
      name: "system_create",
      description: "Create",
      inputSchema: {
        entityType: z.string(),
        upload: z
          .object({ kind: z.literal("web-chat-upload"), id: z.string() })
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

    const withoutSources = convertToSDKTools(
      [tool],
      { conversationId: "conversation-1", interfaceType: "agent" },
      { emit: mock(() => {}) },
    )["system_create"]?.inputSchema;
    const withUpload = convertToSDKTools(
      [tool],
      {
        conversationId: "conversation-1",
        interfaceType: "agent",
        enableCreateUpload: true,
      },
      { emit: mock(() => {}) },
    )["system_create"]?.inputSchema;
    const withTransform = convertToSDKTools(
      [tool],
      {
        conversationId: "conversation-1",
        interfaceType: "agent",
        enableCreateTransform: true,
      },
      { emit: mock(() => {}) },
    )["system_create"]?.inputSchema;
    const withSourceAttachment = convertToSDKTools(
      [tool],
      {
        conversationId: "conversation-1",
        interfaceType: "agent",
        enableCreateSourceAttachment: true,
      },
      { emit: mock(() => {}) },
    )["system_create"]?.inputSchema;

    if (
      !withoutSources ||
      !withUpload ||
      !withTransform ||
      !withSourceAttachment
    ) {
      throw new Error("Expected system_create schemas");
    }
    const withoutSourcesShape = (withoutSources as z.ZodObject<z.ZodRawShape>)
      .shape;
    const withUploadShape = (withUpload as z.ZodObject<z.ZodRawShape>).shape;
    const withTransformShape = (withTransform as z.ZodObject<z.ZodRawShape>)
      .shape;
    const withSourceAttachmentShape = (
      withSourceAttachment as z.ZodObject<z.ZodRawShape>
    ).shape;
    expect(Object.keys(withoutSourcesShape)).toEqual(["entityType"]);
    expect(Object.keys(withUploadShape)).toEqual(["entityType", "upload"]);
    expect(Object.keys(withTransformShape)).toEqual([
      "entityType",
      "transform",
    ]);
    expect(Object.keys(withSourceAttachmentShape)).toEqual([
      "entityType",
      "sourceAttachment",
    ]);
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
        channelId: "conversation-1",
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
