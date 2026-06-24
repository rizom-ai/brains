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

  it("keeps attachment URLs out of model-visible tool output", async () => {
    const tool: Tool = {
      name: "document_generate",
      description: "Generate document",
      inputSchema: { sourceEntityId: z.string() },
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
    )["document_generate"];
    if (!sdkTool?.execute || !sdkTool.toModelOutput) {
      throw new Error("Expected document_generate to be executable");
    }

    const result = await sdkTool.execute(
      { sourceEntityId: "deck-1" },
      { toolCallId: "call-1", messages: [] },
    );
    const modelOutput = await sdkTool.toModelOutput({
      toolCallId: "call-1",
      input: { sourceEntityId: "deck-1" },
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
