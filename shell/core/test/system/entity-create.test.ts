import { describe, expect, it, beforeEach } from "bun:test";
import { createSystemTools } from "../../src/system/tools";
import { createOutputSchema } from "../../src/system/schemas";
import { createMockSystemServices } from "./mock-services";
import type { Tool } from "@brains/mcp-service";
import { z } from "@brains/utils";

const enqueuedCreateJobSchema = z.object({
  targetEntityType: z.string(),
  targetEntityId: z.string(),
});

describe("system_create tool", () => {
  let tools: Tool[];
  let services: ReturnType<typeof createMockSystemServices>;

  beforeEach(() => {
    services = createMockSystemServices();
    tools = createSystemTools(services);
  });

  function exec(input: Record<string, unknown>): Promise<unknown> {
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

  it("should pass targetEntityType and targetEntityId to job data", async () => {
    await exec({
      entityType: "image",
      prompt: "Generate a cover image",
      targetEntityType: "post",
      targetEntityId: "my-blog-post",
    });

    const enqueuedJob = services.getLastEnqueuedJob();
    if (!enqueuedJob) throw new Error("No job was enqueued");
    const jobData = enqueuedCreateJobSchema.parse(enqueuedJob.data);
    expect(jobData.targetEntityType).toBe("post");
    expect(jobData.targetEntityId).toBe("my-blog-post");
  });

  it("should not include options field in schema", () => {
    const tool = tools.find((t) => t.name === "system_create");
    if (!tool) throw new Error("system_create not found");
    const schema = tool.inputSchema;
    const shape = (schema as { shape?: Record<string, unknown> }).shape;
    expect(shape).not.toHaveProperty("options");
  });

  it("should pass target fields as top-level (not nested in options)", async () => {
    await exec({
      entityType: "image",
      prompt: "Generate image",
      targetEntityType: "post",
      targetEntityId: "test-post",
    });

    const enqueuedJob = services.getLastEnqueuedJob();
    if (!enqueuedJob) throw new Error("No job was enqueued");
    const rawJobData = z.record(z.unknown()).parse(enqueuedJob.data);
    expect(rawJobData).not.toHaveProperty("options");
    const jobData = enqueuedCreateJobSchema.parse(rawJobData);
    expect(jobData.targetEntityType).toBe("post");
  });
});
