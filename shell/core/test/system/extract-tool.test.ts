import { beforeEach, describe, expect, it } from "bun:test";
import { createSystemTools } from "../../src/system/tools";
import { createMockSystemServices } from "./mock-services";
import type { Tool } from "@brains/mcp-service";

describe("system_extract tool", () => {
  let tools: Tool[];
  let services: ReturnType<typeof createMockSystemServices>;

  beforeEach(() => {
    services = createMockSystemServices();
    services.addEntities([
      {
        id: "topic-1",
        entityType: "topic",
        content: "",
        contentHash: "hash",
        metadata: {},
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
      },
      {
        id: "series-1",
        entityType: "series",
        content: "",
        contentHash: "hash",
        metadata: {},
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
      },
      {
        id: "post-1",
        entityType: "post",
        content: "# Post",
        contentHash: "post-hash",
        metadata: { title: "Post" },
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
      },
    ]);
    tools = createSystemTools(services);
  });

  function exec(input: Record<string, unknown>): Promise<unknown> {
    const tool = tools.find((t) => t.name === "system_extract");
    if (!tool) throw new Error("system_extract not found");
    return tool.handler(input, { interfaceType: "test", userId: "test" });
  }

  it("requires confirmation for topic rebuild", async () => {
    const result = await exec({ entityType: "topic", mode: "rebuild" });

    expect(result).toHaveProperty("needsConfirmation", true);
    expect(result).toHaveProperty("toolName", "system_extract");
    expect(result).toHaveProperty("args.confirmed", true);
    expect(result).toHaveProperty("args.mode", "rebuild");
  });

  it("queues topic rebuild after confirmation", async () => {
    const result = await exec({
      entityType: "topic",
      mode: "rebuild",
      confirmed: true,
    });

    expect(result).toHaveProperty("success", true);
    expect(result).toHaveProperty("data.mode", "rebuild");

    const enqueuedJob = services.getLastEnqueuedJob();
    expect(enqueuedJob?.type).toBe("topic:project");
    expect(enqueuedJob?.data).toEqual({ mode: "rebuild" });
  });

  it("queues single-source extraction through the projection job", async () => {
    const result = await exec({ entityType: "topic", source: "post-1" });

    expect(result).toHaveProperty("success", true);
    expect(result).toHaveProperty("data.mode", "derive");
    expect(result).toHaveProperty("data.source", "post-1");

    const enqueuedJob = services.getLastEnqueuedJob();
    expect(enqueuedJob?.type).toBe("topic:project");
    expect(enqueuedJob?.data).toEqual({
      mode: "source",
      entityId: "post-1",
      entityType: "post",
    });
  });

  it("falls back to projection for unsupported rebuild requests", async () => {
    const result = await exec({ entityType: "series", mode: "rebuild" });

    expect(result).toHaveProperty("success", true);
    expect(result).toHaveProperty("data.mode", "derive");
    expect(result).toHaveProperty(
      "message",
      "Rebuild is currently only supported for batch topic extraction. Ran normal projection mode for series instead.",
    );

    const enqueuedJob = services.getLastEnqueuedJob();
    expect(enqueuedJob?.type).toBe("series:project");
    expect(enqueuedJob?.data).toEqual({ mode: "derive" });
  });
});
