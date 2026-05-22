import { beforeEach, describe, expect, it } from "bun:test";
import { createSystemTools } from "../../src/system/tools";
import { createMockSystemServices } from "./mock-services";
import type { Tool, ToolContext } from "@brains/mcp-service";

describe("system_extract tool enforces caller visibility scope", () => {
  let tools: Tool[];
  let services: ReturnType<typeof createMockSystemServices>;

  beforeEach(() => {
    services = createMockSystemServices();
    services.addEntities([
      {
        id: "topic-1",
        entityType: "topic",
        content: "",
        contentHash: "h",
        visibility: "public",
        metadata: {},
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
      },
      {
        id: "post-shared",
        entityType: "post",
        content: "# Shared",
        contentHash: "ps",
        visibility: "shared",
        metadata: {},
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
      },
    ]);
    tools = createSystemTools(services);
  });

  function exec(
    input: Record<string, unknown>,
    context: ToolContext,
  ): Promise<unknown> {
    const tool = tools.find((t) => t.name === "system_extract");
    if (!tool) throw new Error("system_extract not found");
    return tool.handler(input, context);
  }

  it("lets a trusted caller extract from a shared source", async () => {
    const result = await exec(
      { entityType: "topic", source: "post-shared" },
      { interfaceType: "mcp", userId: "u", userPermissionLevel: "trusted" },
    );

    expect(result).toHaveProperty("success", true);
    const enqueuedJob = services.getLastEnqueuedJob();
    expect(enqueuedJob?.data).toEqual({
      mode: "source",
      entityId: "post-shared",
      entityType: "post",
    });
  });

  it("refuses to extract from a shared source for a public caller", async () => {
    const result = await exec(
      { entityType: "topic", source: "post-shared" },
      { interfaceType: "mcp", userId: "u", userPermissionLevel: "public" },
    );

    expect(result).toMatchObject({
      success: false,
      error: expect.stringContaining("not found"),
    });
  });
});
