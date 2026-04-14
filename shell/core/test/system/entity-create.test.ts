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

const enqueuedLinkJobSchema = z.object({
  url: z.string().url(),
  metadata: z.object({
    interfaceId: z.string(),
    userId: z.string(),
    channelId: z.string().optional(),
    channelName: z.string().optional(),
    timestamp: z.string(),
  }),
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

  it("should route prompted link creation with a URL to link capture", async () => {
    const result = await exec({
      entityType: "link",
      prompt: "Save this link for me: https://anthropic.com/research",
    });

    expect(result).toHaveProperty("success", true);
    const data = createOutputSchema.parse((result as { data: unknown }).data);
    expect(data.status).toBe("generating");
    expect(data.jobId).toBeDefined();

    const enqueuedJob = services.getLastEnqueuedJob();
    if (!enqueuedJob) throw new Error("No job was enqueued");
    expect(enqueuedJob.type).toBe("link-capture");
    const jobData = enqueuedLinkJobSchema.parse(enqueuedJob.data);
    expect(jobData.url).toBe("https://anthropic.com/research");
    expect(jobData.metadata.interfaceId).toBe("test");
    expect(jobData.metadata.userId).toBe("test");
  });

  it("should create a link directly from full markdown/frontmatter content", async () => {
    const markdown = `---
status: draft
title: Anthropic Research
url: https://anthropic.com/research
description: Research updates from Anthropic
keywords:
  - ai
  - research
domain: anthropic.com
capturedAt: "2026-04-14T08:00:00.000Z"
source:
  ref: "manual:local"
  label: MANUAL
---

A saved research link.`;

    const result = await exec({
      entityType: "link",
      content: markdown,
    });

    expect(result).toHaveProperty("success", true);
    const data = createOutputSchema.parse((result as { data: unknown }).data);
    expect(data.status).toBe("created");
    expect(data.entityId).toBeDefined();
    if (!data.entityId) throw new Error("Expected entityId to be defined");

    const stored = await services.entityService.getEntity(
      "link",
      data.entityId,
    );
    expect(stored).not.toBeNull();
    expect(stored?.metadata["title"]).toBe("Anthropic Research");
    expect(stored?.metadata["status"]).toBe("draft");
    expect(stored?.content).toBe(markdown);
  });

  it("should route raw link content to link capture", async () => {
    const result = await exec({
      entityType: "link",
      content: "https://en.wikipedia.org/wiki/The_Drama_(film)",
    });

    expect(result).toHaveProperty("success", true);
    const data = createOutputSchema.parse((result as { data: unknown }).data);
    expect(data.status).toBe("generating");

    const enqueuedJob = services.getLastEnqueuedJob();
    if (!enqueuedJob) throw new Error("No job was enqueued");
    expect(enqueuedJob.type).toBe("link-capture");
    const jobData = enqueuedLinkJobSchema.parse(enqueuedJob.data);
    expect(jobData.url).toBe("https://en.wikipedia.org/wiki/The_Drama_(film)");
  });

  it("should reject invalid direct link content that is not full markdown/frontmatter", async () => {
    const result = await exec({
      entityType: "link",
      content: "This is not a valid link entity body.",
    });

    expect(result).toHaveProperty("success", false);
    expect((result as { error: string }).error).toContain(
      "Direct link creation requires full link markdown/frontmatter",
    );
  });

  it("should reject prompted link creation without a URL", async () => {
    const result = await exec({
      entityType: "link",
      prompt: "Save the article I mentioned earlier",
    });

    expect(result).toHaveProperty("success", false);
    expect((result as { error: string }).error).toContain("requires a URL");
  });

  it("should ignore empty optional strings when queuing generation jobs", async () => {
    await exec({
      entityType: "post",
      prompt: "Write about TypeScript.",
      title: "",
      content: "",
      targetEntityType: "",
      targetEntityId: "",
    });

    const enqueuedJob = services.getLastEnqueuedJob();
    if (!enqueuedJob) throw new Error("No job was enqueued");
    expect(enqueuedJob.type).toBe("post:generation");
    const rawJobData = z.record(z.unknown()).parse(enqueuedJob.data);
    expect(rawJobData["title"]).toBeUndefined();
    expect(rawJobData["content"]).toBeUndefined();
    expect(rawJobData["targetEntityType"]).toBeUndefined();
    expect(rawJobData["targetEntityId"]).toBeUndefined();
    expect(rawJobData["prompt"]).toBe("Write about TypeScript.");
  });

  it("should resolve image generation targets to canonical entity ids", async () => {
    services.addEntities([
      {
        id: "my-blog-post",
        entityType: "post",
        content: "---\ntitle: My Blog Post\nslug: my-blog-post\n---\nContent",
        metadata: { title: "My Blog Post", slug: "my-blog-post" },
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
        contentHash: "hash-1",
      },
    ]);

    await exec({
      entityType: "image",
      prompt: "Generate a cover image",
      targetEntityType: "post",
      targetEntityId: "My Blog Post",
    });

    const enqueuedJob = services.getLastEnqueuedJob();
    if (!enqueuedJob) throw new Error("No job was enqueued");
    const jobData = enqueuedCreateJobSchema.parse(enqueuedJob.data);
    expect(jobData.targetEntityType).toBe("post");
    expect(jobData.targetEntityId).toBe("my-blog-post");
  });

  it("should reject image generation when the target entity does not exist", async () => {
    const result = await exec({
      entityType: "image",
      prompt: "Generate a cover image",
      targetEntityType: "post",
      targetEntityId: "missing-post",
    });

    expect(result).toHaveProperty("success", false);
    expect((result as { error: string }).error).toContain(
      "Target entity not found: post/missing-post",
    );
  });

  it("should not include options field in schema", () => {
    const tool = tools.find((t) => t.name === "system_create");
    if (!tool) throw new Error("system_create not found");
    const schema = tool.inputSchema;
    const shape = (schema as { shape?: Record<string, unknown> }).shape;
    expect(shape).not.toHaveProperty("options");
  });

  it("should pass target fields as top-level (not nested in options)", async () => {
    services.addEntities([
      {
        id: "test-post",
        entityType: "post",
        content: "---\ntitle: Test Post\nslug: test-post\n---\nContent",
        metadata: { title: "Test Post", slug: "test-post" },
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
        contentHash: "hash-2",
      },
    ]);

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
