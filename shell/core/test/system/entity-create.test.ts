import { describe, expect, it, beforeEach } from "bun:test";
import { createSystemTools } from "../../src/system/tools";
import { createOutputSchema } from "../../src/system/schemas";
import { createMockSystemServices } from "./mock-services";
import type {
  BaseEntity,
  CreateExecutionContext,
  CreateInput,
  CreateInterceptionResult,
} from "@brains/entity-service";
import type { Tool } from "@brains/mcp-service";
import { z, slugify } from "@brains/utils";

const enqueuedCreateJobSchema = z.object({
  targetEntityType: z.string(),
  targetEntityId: z.string(),
});

const enqueuedCoverImageJobSchema = z.object({
  prompt: z.string(),
  title: z.string(),
  aspectRatio: z.string(),
  targetEntityType: z.string(),
  targetEntityId: z.string(),
  entityTitle: z.string().optional(),
  entityContent: z.string().optional(),
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

const URL_PATTERN = /https?:\/\/[^\s<>"{}|\\^`[\]]+?(?=[,;:\s]|$)/i;
type MockServices = ReturnType<typeof createMockSystemServices>;

function extractFirstUrl(
  ...values: Array<string | undefined>
): string | undefined {
  for (const value of values) {
    const url = value?.match(URL_PATTERN)?.[0];
    if (url) return url;
  }

  return undefined;
}

async function resolveMockEntityByIdentifier(
  services: MockServices,
  entityType: string,
  identifier: string,
): Promise<BaseEntity | null> {
  const byId = await services.entityService.getEntity({
    entityType: entityType,
    id: identifier,
  });
  if (byId) return byId;

  const bySlug = await services.entityService.listEntities({
    entityType: entityType,
    options: {
      filter: { metadata: { slug: identifier } },
    },
  });
  if (bySlug[0]) return bySlug[0];

  const byTitle = await services.entityService.listEntities({
    entityType: entityType,
    options: {
      filter: { metadata: { title: identifier } },
    },
  });
  return byTitle[0] ?? null;
}

function registerLinkCreateInterceptor(services: MockServices): void {
  services.entityRegistry.registerCreateInterceptor(
    "link",
    async (
      input: CreateInput,
      executionContext: CreateExecutionContext,
    ): Promise<CreateInterceptionResult> => {
      if (input.content) {
        try {
          const adapter = services.entityRegistry.getAdapter("link");
          const parsed = adapter.fromMarkdown(input.content);
          const parsedMetadata = parsed.metadata as
            | Record<string, unknown>
            | undefined;
          const parsedTitle =
            typeof parsedMetadata?.["title"] === "string"
              ? parsedMetadata["title"]
              : undefined;
          const parsedStatus =
            typeof parsedMetadata?.["status"] === "string"
              ? parsedMetadata["status"]
              : undefined;
          const parsedUrl = extractFirstUrl(input.content);

          if (parsedTitle && parsedStatus && parsedUrl) {
            const id =
              slugify(parsedUrl) ||
              slugify(parsedTitle) ||
              `${input.entityType}-${Date.now()}`;
            const now = new Date().toISOString();
            const result = await services.entityService.createEntity({
              entity: {
                id,
                entityType: input.entityType,
                content: input.content,
                metadata: {
                  title: parsedTitle,
                  status: parsedStatus,
                },
                created: now,
                updated: now,
              },
            });

            return {
              kind: "handled",
              result: {
                success: true,
                data: { entityId: result.entityId, status: "created" },
              },
            };
          }
        } catch {
          // Fall through: raw URLs should route to capture below.
        }
      }

      const url =
        input.url ?? extractFirstUrl(input.content, input.prompt, input.title);
      if (url) {
        const jobId = await services.jobs.enqueue({
          type: "link-capture",
          data: {
            url,
            metadata: {
              interfaceId: executionContext.interfaceType,
              userId: executionContext.userId,
              ...(executionContext.channelId
                ? { channelId: executionContext.channelId }
                : {}),
              ...(executionContext.channelName
                ? { channelName: executionContext.channelName }
                : {}),
              timestamp: new Date().toISOString(),
            },
          },
        });

        return {
          kind: "handled",
          result: {
            success: true,
            data: { status: "generating", jobId },
          },
        };
      }

      if (input.content) {
        return {
          kind: "handled",
          result: {
            success: false,
            error:
              "Direct link creation requires full link markdown/frontmatter, or provide a URL to capture.",
          },
        };
      }

      if (input.prompt) {
        return {
          kind: "handled",
          result: {
            success: false,
            error:
              "Link creation requires a URL in the prompt, content, or title, or full link markdown content for direct creation.",
          },
        };
      }

      return { kind: "continue", input };
    },
  );
}

function registerImageCreateInterceptor(services: MockServices): void {
  services.entityRegistry.registerCreateInterceptor(
    "image",
    async (input: CreateInput): Promise<CreateInterceptionResult> => {
      if (!input.targetEntityType || !input.targetEntityId) {
        return { kind: "continue", input };
      }

      const resolved = await resolveMockEntityByIdentifier(
        services,
        input.targetEntityType,
        input.targetEntityId,
      );
      if (!resolved) {
        return {
          kind: "handled",
          result: {
            success: false,
            error: `Target entity not found: ${input.targetEntityType}/${input.targetEntityId}`,
          },
        };
      }

      return {
        kind: "continue",
        input: {
          ...input,
          targetEntityId: resolved.id,
        },
      };
    },
  );
}

describe("system_create tool", () => {
  let tools: Tool[];
  let services: ReturnType<typeof createMockSystemServices>;

  beforeEach(() => {
    services = createMockSystemServices();
    registerLinkCreateInterceptor(services);
    registerImageCreateInterceptor(services);
    tools = createSystemTools(services);
  });

  function exec(
    input: Record<string, unknown>,
    context?: {
      interfaceType?: string;
      userId?: string;
      channelId?: string;
      channelName?: string;
    },
  ): Promise<unknown> {
    const tool = tools.find((t) => t.name === "system_create");
    if (!tool) throw new Error("system_create not found");
    return tool.handler(input, {
      interfaceType: context?.interfaceType ?? "test",
      userId: context?.userId ?? "test",
      ...(context?.channelId ? { channelId: context.channelId } : {}),
      ...(context?.channelName ? { channelName: context.channelName } : {}),
    });
  }

  it("should pass normalized input and execution context to registered create interceptors", async () => {
    let capturedInput: CreateInput | undefined;
    let capturedContext: CreateExecutionContext | undefined;

    services.entityRegistry.registerCreateInterceptor(
      "base",
      async (input, executionContext) => {
        capturedInput = input;
        capturedContext = executionContext;
        return {
          kind: "handled",
          result: {
            success: true,
            data: { status: "intercepted", entityId: "intercepted-id" },
          },
        } as const;
      },
    );

    const result = await exec(
      {
        entityType: "base",
        prompt: "Write about TypeScript.",
        title: "",
        content: "",
        targetEntityType: "",
        targetEntityId: "",
      },
      {
        interfaceType: "matrix",
        userId: "alice",
        channelId: "!room:test",
        channelName: "#general",
      },
    );

    expect(result).toEqual({
      success: true,
      data: { status: "intercepted", entityId: "intercepted-id" },
    });
    expect(capturedInput).toEqual({
      entityType: "base",
      prompt: "Write about TypeScript.",
    });
    expect(capturedContext).toEqual({
      interfaceType: "matrix",
      userId: "alice",
      channelId: "!room:test",
      channelName: "#general",
    });
  });

  it("should return handled interceptor results without falling through", async () => {
    services.entityRegistry.registerCreateInterceptor("base", async () => ({
      kind: "handled",
      result: {
        success: true,
        data: { status: "handled", entityId: "from-interceptor" },
      },
    }));

    const result = await exec({
      entityType: "base",
      title: "My Note",
      content: "This is a test.",
    });

    expect(result).toEqual({
      success: true,
      data: { status: "handled", entityId: "from-interceptor" },
    });
    expect(services.getEntities().size).toBe(0);
    expect(services.getLastEnqueuedJob()).toBeUndefined();
  });

  it("should continue with rewritten input for generation jobs", async () => {
    services.entityRegistry.registerCreateInterceptor(
      "base",
      async (input) => ({
        kind: "continue",
        input: {
          ...input,
          prompt: "Rewritten prompt",
          title: "Rewritten Title",
        },
      }),
    );

    await exec({
      entityType: "base",
      prompt: "Original prompt",
    });

    const enqueuedJob = services.getLastEnqueuedJob();
    if (!enqueuedJob) throw new Error("No job was enqueued");
    expect(enqueuedJob.type).toBe("base:generation");
    expect(enqueuedJob.data).toEqual({
      prompt: "Rewritten prompt",
      title: "Rewritten Title",
    });
  });

  it("should continue with rewritten input for direct create", async () => {
    services.entityRegistry.registerCreateInterceptor(
      "base",
      async (input) => ({
        kind: "continue",
        input: {
          ...input,
          title: "Interceptor Title",
          content: "Interceptor body.",
        },
      }),
    );

    const result = await exec({
      entityType: "base",
      title: "Original Title",
      content: "Original body.",
    });

    const data = createOutputSchema.parse((result as { data: unknown }).data);
    expect(data.entityId).toBe("interceptor-title");
    const entity = await services.entityService.getEntity({
      entityType: "base",
      id: "interceptor-title",
    });
    expect(entity?.content).toBe("Interceptor body.");
    expect(entity?.metadata["title"]).toBe("Interceptor Title");
  });

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

    const entity = await services.entityService.getEntity({
      entityType: "base",
      id: "retrievable-note",
    });
    expect(entity).not.toBeNull();
  });

  it("should use adapter-validated markdown creation for structured content", async () => {
    services.addEntities([
      {
        id: "existing-deck",
        entityType: "deck",
        content: "Existing deck",
        metadata: { title: "Existing Deck" },
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
        contentHash: "hash-existing-deck",
      },
    ]);
    const markdown = `---
title: Approved Deck
slug: approved-deck
status: draft
---

# Approved Deck

---

## Final Slide`;

    const result = await exec({
      entityType: "deck",
      title: "Approved Deck",
      content: markdown,
    });

    expect(result).toHaveProperty("success", true);
    const data = createOutputSchema.parse((result as { data: unknown }).data);
    expect(data).toEqual({ status: "created", entityId: "approved-deck" });
    expect(services.getLastEnqueuedJob()).toBeUndefined();
    expect(services.getLastMarkdownCreate()).toEqual({
      entityType: "deck",
      id: "approved-deck",
      markdown,
    });
  });

  it("should keep base direct content on the generic create path", async () => {
    await exec({
      entityType: "base",
      title: "Plain Note",
      content: "No frontmatter required.",
    });

    expect(services.getLastMarkdownCreate()).toBeUndefined();
    const entity = await services.entityService.getEntity({
      entityType: "base",
      id: "plain-note",
    });
    expect(entity?.content).toBe("No frontmatter required.");
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

  it("should require content, prompt, or url", async () => {
    const result = await exec({
      entityType: "base",
      title: "Nothing else",
    });

    expect(result).toHaveProperty("success", false);
  });

  it("should reject url-only create for unsupported entity types", async () => {
    const result = await exec({
      entityType: "base",
      url: "https://example.com/test",
    });

    expect(result).toHaveProperty("success", false);
    expect((result as { error: string }).error).toContain(
      "URL-only creation is supported only for entity types that explicitly handle it",
    );
  });

  it("should queue agent generation from top-level url", async () => {
    services.entityRegistry.registerCreateInterceptor(
      "agent",
      async (input) => ({
        kind: "continue",
        input:
          input.url && !input.prompt && !input.content
            ? { ...input, prompt: input.url }
            : input,
      }),
    );

    const result = await exec({
      entityType: "agent",
      url: "https://yeehaa.io",
    });

    expect(result).toHaveProperty("success", true);
    const data = createOutputSchema.parse((result as { data: unknown }).data);
    expect(data.status).toBe("generating");

    const enqueuedJob = services.getLastEnqueuedJob();
    if (!enqueuedJob) throw new Error("No job was enqueued");
    expect(enqueuedJob.type).toBe("agent:generation");
    const rawJobData = z.record(z.unknown()).parse(enqueuedJob.data);
    expect(rawJobData["prompt"]).toBe("https://yeehaa.io");
  });

  it("should route top-level url link creation to link capture", async () => {
    const result = await exec({
      entityType: "link",
      url: "https://anthropic.com/research",
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

    const stored = await services.entityService.getEntity({
      entityType: "link",
      id: data.entityId,
    });
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

  it("should reject targetEntityType without targetEntityId", async () => {
    const result = await exec({
      entityType: "image",
      prompt: "Generate a cover image",
      targetEntityType: "post",
    });

    expect(result).toHaveProperty("success", false);
    expect((result as { error: string }).error).toContain(
      "Provide both 'targetEntityType' and 'targetEntityId' together, or omit both.",
    );
  });

  it("should reject targetEntityId without targetEntityType", async () => {
    const result = await exec({
      entityType: "image",
      prompt: "Generate a cover image",
      targetEntityId: "my-post",
    });

    expect(result).toHaveProperty("success", false);
    expect((result as { error: string }).error).toContain(
      "Provide both 'targetEntityType' and 'targetEntityId' together, or omit both.",
    );
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

  it("should expose top-level url and coverImage, and not include options field in schema", () => {
    const tool = tools.find((t) => t.name === "system_create");
    if (!tool) throw new Error("system_create not found");

    expect(tool.inputSchema).toHaveProperty("url");
    expect(tool.inputSchema).toHaveProperty("coverImage");
    expect(tool.inputSchema).not.toHaveProperty("options");
  });

  it("should queue cover image generation after direct create with actual entity id", async () => {
    const result = await exec({
      entityType: "post",
      title: "Cover Ready Post",
      content: "A post that needs a visual cover.",
      coverImage: {
        generate: true,
        prompt: "Editorial abstract for a cover-ready post",
      },
    });

    expect(result).toHaveProperty("success", true);
    const data = createOutputSchema.parse((result as { data: unknown }).data);
    expect(data.entityId).toBe("cover-ready-post");

    const enqueuedJob = services.getLastEnqueuedJob();
    if (!enqueuedJob) throw new Error("No job was enqueued");
    expect(enqueuedJob.type).toBe("image:image-generate");
    const jobData = enqueuedCoverImageJobSchema.parse(enqueuedJob.data);
    expect(jobData).toMatchObject({
      prompt: "Editorial abstract for a cover-ready post",
      title: "Cover Ready Post Cover",
      aspectRatio: "16:9",
      targetEntityType: "post",
      targetEntityId: "cover-ready-post",
      entityTitle: "Cover Ready Post",
      entityContent: "A post that needs a visual cover.",
    });
  });

  it("should pass normalized coverImage option through generation jobs", async () => {
    await exec({
      entityType: "social-post",
      prompt: "Write a LinkedIn post about continuous learning",
      coverImage: true,
    });

    const enqueuedJob = services.getLastEnqueuedJob();
    if (!enqueuedJob) throw new Error("No job was enqueued");
    expect(enqueuedJob.type).toBe("social-post:generation");
    const rawJobData = z.record(z.unknown()).parse(enqueuedJob.data);
    expect(rawJobData["coverImage"]).toEqual({ generate: true });
  });

  it("should reject coverImage for entity types without cover support", async () => {
    const result = await exec({
      entityType: "base",
      title: "Plain Note",
      content: "Notes do not support cover images in this mock registry.",
      coverImage: true,
    });

    expect(result).toHaveProperty("success", false);
    expect((result as { error: string }).error).toContain(
      "Entity type 'base' doesn't support cover images",
    );
    expect(services.getEntities().size).toBe(0);
    expect(services.getLastEnqueuedJob()).toBeUndefined();
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
