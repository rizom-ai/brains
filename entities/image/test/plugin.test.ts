import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { ImagePlugin } from "../src/image-plugin";
import { createPluginHarness } from "@brains/plugins/test";

describe("ImagePlugin", () => {
  let harness: ReturnType<typeof createPluginHarness>;
  let plugin: ImagePlugin;
  let enqueuedJobs: Array<{ type: string; data: unknown; options?: unknown }>;

  beforeEach(async () => {
    enqueuedJobs = [];
    harness = createPluginHarness({ dataDir: "/tmp/test-image" });
    const shell = harness.getMockShell();
    const jobQueue = shell.getJobQueueService();
    shell.getJobQueueService = (): typeof jobQueue => ({
      ...jobQueue,
      enqueue: async (request): Promise<string> => {
        enqueuedJobs.push(request);
        return "queued-image-job";
      },
    });
    plugin = new ImagePlugin();
    await harness.installPlugin(plugin);
  });

  afterEach(() => {
    harness.reset();
  });

  it("should register as entity plugin", () => {
    expect(plugin.id).toBe("image");
    expect(plugin.type).toBe("entity");
  });

  it("should register image entity type", () => {
    expect(harness.getEntityService().getEntityTypes()).toContain("image");
  });

  it("should return zero tools", async () => {
    const capabilities = await harness.installPlugin(plugin);
    expect(capabilities.tools).toHaveLength(0);
  });

  it("should register a create interceptor for image", () => {
    const interceptor = harness
      .getEntityRegistry()
      .getCreateInterceptor("image");
    expect(interceptor).toBeDefined();
  });

  it("should enqueue prompt-based image generation via interceptor", async () => {
    const interceptor = harness
      .getEntityRegistry()
      .getCreateInterceptor("image");
    if (!interceptor) throw new Error("Expected image create interceptor");

    const result = await interceptor(
      {
        entityType: "image",
        title: "Abstract cover",
        prompt: "Generate an abstract image",
      },
      {
        interfaceType: "test",
        userId: "test-user",
      },
    );

    expect(result).toEqual({
      kind: "handled",
      result: {
        success: true,
        data: {
          entityId: "abstract-cover",
          status: "generating",
          jobId: "queued-image-job",
          attachment: {
            mediaType: "image/png",
            url: "/api/chat/attachments/image?id=abstract-cover",
            downloadUrl:
              "/api/chat/attachments/image?id=abstract-cover&download=1",
            filename: "abstract-cover.png",
            source: {
              entityType: "image",
              entityId: "abstract-cover",
              attachmentType: "generated",
            },
          },
        },
      },
    });
    expect(enqueuedJobs).toHaveLength(1);
    expect(enqueuedJobs[0]).toMatchObject({
      type: "image:image-generate",
      data: {
        prompt: "Generate an abstract image",
        title: "Abstract cover",
      },
    });
  });

  it("should enqueue targeted cover image generation with canonical target id", async () => {
    harness.addEntities([
      {
        id: "my-blog-post",
        entityType: "post",
        content: "---\ntitle: My Blog Post\nslug: my-blog-post\n---\nContent",
        metadata: { title: "My Blog Post", slug: "my-blog-post" },
      },
    ]);

    const interceptor = harness
      .getEntityRegistry()
      .getCreateInterceptor("image");
    if (!interceptor) throw new Error("Expected image create interceptor");

    const result = await interceptor(
      {
        entityType: "image",
        prompt: "Generate a cover image",
        targetEntityType: "post",
        targetEntityId: "My Blog Post",
      },
      {
        interfaceType: "test",
        userId: "test-user",
      },
    );

    expect(result).toEqual({
      kind: "handled",
      result: {
        success: true,
        data: {
          entityId: "cover-my-blog-post",
          status: "generating",
          jobId: "queued-image-job",
          attachment: {
            mediaType: "image/png",
            url: "/api/chat/attachments/image?id=cover-my-blog-post",
            downloadUrl:
              "/api/chat/attachments/image?id=cover-my-blog-post&download=1",
            filename: "cover-my-blog-post.png",
            source: {
              entityType: "image",
              entityId: "cover-my-blog-post",
              attachmentType: "generated",
            },
          },
        },
      },
    });
    expect(enqueuedJobs).toHaveLength(1);
    expect(enqueuedJobs[0]).toMatchObject({
      type: "image:image-generate",
      data: {
        prompt: "Generate a cover image",
        targetEntityType: "post",
        targetEntityId: "my-blog-post",
        entityTitle: "My Blog Post",
      },
    });
  });

  it("should treat non-image content as an image generation prompt for targeted cover requests", async () => {
    harness.addEntities([
      {
        id: "my-blog-post",
        entityType: "post",
        content: "---\ntitle: My Blog Post\nslug: my-blog-post\n---\nContent",
        metadata: { title: "My Blog Post", slug: "my-blog-post" },
      },
    ]);

    const interceptor = harness
      .getEntityRegistry()
      .getCreateInterceptor("image");
    if (!interceptor) throw new Error("Expected image create interceptor");

    const result = await interceptor(
      {
        entityType: "image",
        content: "Generate a cover image",
        targetEntityType: "post",
        targetEntityId: "My Blog Post",
      },
      {
        interfaceType: "test",
        userId: "test-user",
      },
    );

    expect(result.kind).toBe("handled");
    expect(enqueuedJobs[0]?.data).toMatchObject({
      prompt: "Generate a cover image",
      targetEntityType: "post",
      targetEntityId: "my-blog-post",
    });
  });

  it("should return sync error when image target is missing", async () => {
    const interceptor = harness
      .getEntityRegistry()
      .getCreateInterceptor("image");
    if (!interceptor) throw new Error("Expected image create interceptor");

    const result = await interceptor(
      {
        entityType: "image",
        prompt: "Generate a cover image",
        targetEntityType: "post",
        targetEntityId: "missing-post",
      },
      {
        interfaceType: "test",
        userId: "test-user",
      },
    );

    expect(result).toEqual({
      kind: "handled",
      result: {
        success: false,
        error: "Target entity not found: post/missing-post",
      },
    });
  });
});
