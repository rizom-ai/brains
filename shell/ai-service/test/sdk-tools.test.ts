import { describe, expect, it, mock } from "bun:test";
import { MCPService, type Tool } from "@brains/mcp-service";
import { createSilentLogger } from "@brains/test-utils";
import { z } from "@brains/utils";
import { convertToSDKTools, toModelVisibleInputSchema } from "../src/sdk-tools";

describe("convertToSDKTools", () => {
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
