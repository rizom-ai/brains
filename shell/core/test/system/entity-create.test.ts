import { describe, expect, it, beforeEach } from "bun:test";
import { createSystemTools } from "../../src/system/tools";
import { createOutputSchema } from "../../src/system/schemas";
import { createMockSystemServices } from "./mock-services";
import type { PluginTool } from "@brains/mcp-service";

describe("system_create tool", () => {
  let tools: PluginTool[];
  let services: ReturnType<typeof createMockSystemServices>;

  beforeEach(() => {
    services = createMockSystemServices();
    tools = createSystemTools(services);
  });

  function exec(input: Record<string, unknown>) {
    const tool = tools.find((t) => t.name === "system_create");
    if (!tool) throw new Error("system_create not found");
    return tool.handler(input, { interfaceType: "test", userId: "test" });
  }

  it("should create entity with title and content", async () => {
    const result = await exec({
      entityType: "base",
      title: "My Note",
      content: "This is a test.",
    });

    expect(result).toHaveProperty("success", true);
    const data = createOutputSchema.parse((result as { data: unknown }).data);
    expect(data.status).toBe("created");
    expect(data.entityId).toBeDefined();
  });

  it("should slugify title as entity ID", async () => {
    const result = await exec({
      entityType: "base",
      title: "My Cool Note Title",
      content: "Body.",
    });

    const data = createOutputSchema.parse((result as { data: unknown }).data);
    expect(data.entityId).toBe("my-cool-note-title");
  });

  it("should store entity in entity service", async () => {
    await exec({
      entityType: "base",
      title: "Retrievable Note",
      content: "Find me.",
    });

    const entity = await services.entityService.getEntity(
      "base",
      "retrievable-note",
    );
    expect(entity).not.toBeNull();
  });

  it("should queue generation job when prompt provided", async () => {
    const result = await exec({
      entityType: "base",
      prompt: "Write about TypeScript.",
    });

    expect(result).toHaveProperty("success", true);
    const data = createOutputSchema.parse((result as { data: unknown }).data);
    expect(data.status).toBe("generating");
    expect(data.jobId).toBeDefined();
  });

  it("should require content or prompt", async () => {
    const result = await exec({
      entityType: "base",
      title: "Nothing else",
    });

    expect(result).toHaveProperty("success", false);
  });
});
