import { beforeEach, describe, expect, it } from "bun:test";
import { createSystemTools } from "../../src/system/tools";
import { createMockSystemServices } from "./mock-services";
import type { Tool, ToolContext } from "@brains/mcp-service";

describe("system_set-cover tool enforces caller visibility scope", () => {
  let tools: Tool[];
  let services: ReturnType<typeof createMockSystemServices>;

  beforeEach(() => {
    services = createMockSystemServices();
    services.addEntities([
      {
        id: "post-public",
        entityType: "post",
        content: "# Public Post",
        contentHash: "h1",
        visibility: "public",
        metadata: {},
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
      },
      {
        id: "post-shared",
        entityType: "post",
        content: "# Shared Post",
        contentHash: "h2",
        visibility: "shared",
        metadata: {},
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
      },
      {
        id: "image-public",
        entityType: "image",
        content: "data:image/png;base64,...",
        contentHash: "ih1",
        visibility: "public",
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
    const tool = tools.find((t) => t.name === "system_set-cover");
    if (!tool) throw new Error("system_set-cover not found");
    return tool.handler(input, context);
  }

  it("lets a trusted caller set a cover on a shared post", async () => {
    const result = await exec(
      { entityType: "post", entityId: "post-shared", imageId: "image-public" },
      { interfaceType: "mcp", userId: "u", userPermissionLevel: "trusted" },
    );

    expect(result).toHaveProperty("success", true);
  });

  it("refuses to set a cover on a shared post for a public caller", async () => {
    const result = await exec(
      { entityType: "post", entityId: "post-shared", imageId: "image-public" },
      { interfaceType: "mcp", userId: "u", userPermissionLevel: "public" },
    );

    expect(result).toMatchObject({
      success: false,
      error: expect.stringContaining("not found"),
    });
  });

  it("lets a public caller set a cover on a public post", async () => {
    const result = await exec(
      { entityType: "post", entityId: "post-public", imageId: "image-public" },
      { interfaceType: "mcp", userId: "u", userPermissionLevel: "public" },
    );

    expect(result).toHaveProperty("success", true);
  });
});
