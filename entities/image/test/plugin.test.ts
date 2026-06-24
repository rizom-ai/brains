import { rm } from "node:fs/promises";
import { join } from "node:path";
import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { ImagePlugin } from "../src/image-plugin";
import { createPluginHarness } from "@brains/plugins/test";
import type { JobHandler } from "@brains/plugins";
import { ProgressReporter } from "@brains/utils";

class InstructionTestImagePlugin extends ImagePlugin {
  public getInstructionsForTest(): Promise<string | undefined> {
    return this.getInstructions();
  }
}

describe("ImagePlugin", () => {
  let harness: ReturnType<typeof createPluginHarness>;
  let plugin: ImagePlugin;
  let enqueuedJobs: Array<{ type: string; data: unknown; options?: unknown }>;
  let registeredHandlers: Map<string, JobHandler>;

  beforeEach(async () => {
    enqueuedJobs = [];
    registeredHandlers = new Map();
    harness = createPluginHarness({
      dataDir: `/tmp/test-image-${crypto.randomUUID()}`,
    });
    const shell = harness.getMockShell();
    const jobQueue = shell.getJobQueueService();
    shell.getJobQueueService = (): typeof jobQueue => ({
      ...jobQueue,
      enqueue: async (request): Promise<string> => {
        enqueuedJobs.push(request);
        return "queued-image-job";
      },
      registerHandler: (type, handler): void => {
        registeredHandlers.set(type, handler);
      },
      getHandler: (type) => registeredHandlers.get(type),
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

  it("should keep image discussion note saves off raw upload-save paths in instructions", async () => {
    const instructions =
      await new InstructionTestImagePlugin().getInstructionsForTest();

    expect(instructions).toContain(
      "Saving an image description, discussion, interpretation, or caption as a note should create a note entity with content from the conversation, not system_upload_save or upload/transform.",
    );
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

  it("should register an image upload-save handler", () => {
    const registration = harness
      .getEntityRegistry()
      .getUploadSaveHandler("image/png");
    expect(registration?.entityType).toBe("image");
  });

  async function runQueuedUploadPromotion(): Promise<void> {
    const handler = registeredHandlers.get("image:upload-promote");
    if (!handler) throw new Error("image:upload-promote handler missing");
    const job = enqueuedJobs[0];
    if (!job) throw new Error("upload promotion job not queued");
    const reporter = ProgressReporter.from(async () => {});
    if (!reporter) throw new Error("progress reporter not created");
    await handler.process(job.data, "queued-image-job", reporter);
  }

  it("queues uploaded image promotion into a durable image entity", async () => {
    const store = harness
      .getMockShell()
      .getRuntimeUploadRegistry()
      .scoped({
        namespace: "upload",
        refKind: "upload",
        routePath: "/api/chat/uploads",
        createId: () => "upload-00000000-0000-4000-8000-000000000201",
      });
    const pngBytes = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
      "base64",
    );
    const record = await store.save({
      filename: "robot.png",
      mediaType: "image/png",
      content: pngBytes,
    });
    const interceptor = harness
      .getEntityRegistry()
      .getCreateInterceptor("image");
    if (!interceptor) throw new Error("Expected image create interceptor");

    const result = await interceptor(
      {
        entityType: "image",
        title: "Robot",
        from: { kind: "upload", id: record.ref.id },
      },
      {
        interfaceType: "web-chat",
        userId: "operator",
      },
    );

    expect(result).toEqual({
      kind: "handled",
      result: {
        success: true,
        data: {
          entityId: "robot",
          status: "generating",
          jobId: "queued-image-job",
          attachment: {
            mediaType: "image/png",
            url: "/api/chat/attachments/image?id=robot",
            downloadUrl: "/api/chat/attachments/image?id=robot&download=1",
            filename: "robot.png",
            source: {
              entityType: "image",
              entityId: "robot",
              attachmentType: "uploaded",
            },
          },
        },
      },
    });
    expect(enqueuedJobs[0]).toMatchObject({
      type: "image:upload-promote",
      data: { uploadId: record.ref.id, title: "Robot" },
    });

    let entity = await harness.getEntityService().getEntity({
      entityType: "image",
      id: "robot",
    });
    expect(entity?.metadata).toMatchObject({
      title: "Robot",
      alt: "Robot",
      status: "pending",
      sourceUploadId: record.ref.id,
      sourceFilename: "robot.png",
      sourceMediaType: "image/png",
      attachmentType: "uploaded",
    });

    await runQueuedUploadPromotion();

    entity = await harness.getEntityService().getEntity({
      entityType: "image",
      id: "robot",
    });
    expect(entity?.content).toBe(
      `data:image/png;base64,${pngBytes.toString("base64")}`,
    );
    expect(entity?.metadata).toMatchObject({
      title: "Robot",
      alt: "Robot",
      format: "png",
      status: "draft",
      sourceUploadId: record.ref.id,
      sourceFilename: "robot.png",
      sourceMediaType: "image/png",
      attachmentType: "uploaded",
    });
  });

  it("marks a pending uploaded image failed when promotion processing fails", async () => {
    const store = harness
      .getMockShell()
      .getRuntimeUploadRegistry()
      .scoped({
        namespace: "upload",
        refKind: "upload",
        routePath: "/api/chat/uploads",
        createId: () => "upload-00000000-0000-4000-8000-000000000203",
      });
    const record = await store.save({
      filename: "broken.png",
      mediaType: "image/png",
      content: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
        "base64",
      ),
    });
    const interceptor = harness
      .getEntityRegistry()
      .getCreateInterceptor("image");
    if (!interceptor) throw new Error("Expected image create interceptor");

    await interceptor(
      {
        entityType: "image",
        title: "Broken",
        from: { kind: "upload", id: record.ref.id },
      },
      {
        interfaceType: "web-chat",
        userId: "operator",
      },
    );
    await rm(join(store.getUploadDir(record.ref.id), "content"));

    const handler = registeredHandlers.get("image:upload-promote");
    if (!handler) throw new Error("image:upload-promote handler missing");
    const job = enqueuedJobs[0];
    if (!job) throw new Error("upload promotion job not queued");
    const reporter = ProgressReporter.from(async () => {});
    if (!reporter) throw new Error("progress reporter not created");

    const result = await handler.process(
      job.data,
      "queued-image-job",
      reporter,
    );

    expect(result).toMatchObject({ success: false });
    const entity = await harness.getEntityService().getEntity({
      entityType: "image",
      id: "broken",
    });
    expect(entity?.metadata).toMatchObject({
      status: "failed",
      processingError: expect.stringContaining("Upload not found"),
    });
  });

  it("should reject non-image upload promotion to image", async () => {
    const store = harness
      .getMockShell()
      .getRuntimeUploadRegistry()
      .scoped({
        namespace: "upload",
        refKind: "upload",
        routePath: "/api/chat/uploads",
        createId: () => "upload-00000000-0000-4000-8000-000000000202",
      });
    const record = await store.save({
      filename: "brief.pdf",
      mediaType: "application/pdf",
      content: Buffer.from("%PDF-1.4\n%EOF\n"),
    });
    const interceptor = harness
      .getEntityRegistry()
      .getCreateInterceptor("image");
    if (!interceptor) throw new Error("Expected image create interceptor");

    const result = await interceptor(
      {
        entityType: "image",
        from: { kind: "upload", id: record.ref.id },
      },
      {
        interfaceType: "web-chat",
        userId: "operator",
      },
    );

    expect(result).toEqual({
      kind: "handled",
      result: {
        success: false,
        error: "Only image uploads can be promoted to image entities",
      },
    });
    expect(enqueuedJobs).toHaveLength(0);
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

  it("should treat empty target fields as standalone image generation", async () => {
    const interceptor = harness
      .getEntityRegistry()
      .getCreateInterceptor("image");
    if (!interceptor) throw new Error("Expected image create interceptor");

    const result = await interceptor(
      {
        entityType: "image",
        title: "Robot",
        prompt: "Can you generate an image of a robot for me?",
        content: "",
        targetEntityType: "",
        targetEntityId: "",
      },
      {
        interfaceType: "test",
        userId: "test-user",
      },
    );

    expect(result.kind).toBe("handled");
    expect(enqueuedJobs).toHaveLength(1);
    expect(enqueuedJobs[0]).toMatchObject({
      type: "image:image-generate",
      data: {
        prompt: "Can you generate an image of a robot for me?",
        title: "Robot",
      },
    });
    expect(enqueuedJobs[0]?.data).not.toMatchObject({
      targetEntityType: expect.any(String),
    });
    expect(enqueuedJobs[0]?.data).not.toMatchObject({
      targetEntityId: expect.any(String),
    });
    expect(enqueuedJobs[0]?.data).not.toMatchObject({
      entityContent: expect.any(String),
    });
  });

  it("should treat image target fields as standalone image generation", async () => {
    const interceptor = harness
      .getEntityRegistry()
      .getCreateInterceptor("image");
    if (!interceptor) throw new Error("Expected image create interceptor");

    const result = await interceptor(
      {
        entityType: "image",
        prompt: "Can you generate an image of a robot for me?",
        targetEntityType: "image",
        targetEntityId: "robot",
      },
      {
        interfaceType: "test",
        userId: "test-user",
      },
    );

    expect(result.kind).toBe("handled");
    expect(enqueuedJobs).toHaveLength(1);
    expect(enqueuedJobs[0]?.data).toMatchObject({
      prompt: "Can you generate an image of a robot for me?",
      title: "robot",
    });
    expect(enqueuedJobs[0]?.data).not.toMatchObject({
      targetEntityType: expect.any(String),
    });
    expect(enqueuedJobs[0]?.data).not.toMatchObject({
      targetEntityId: expect.any(String),
    });
    expect(enqueuedJobs[0]?.data).not.toMatchObject({
      entityContent: expect.any(String),
    });
  });

  it("should not enqueue generated image data for prompt distillation", async () => {
    harness.addEntities([
      {
        id: "pretty-robot",
        entityType: "image",
        content: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB",
        metadata: { title: "Pretty Robot" },
      },
    ]);

    const interceptor = harness
      .getEntityRegistry()
      .getCreateInterceptor("image");
    if (!interceptor) throw new Error("Expected image create interceptor");

    const result = await interceptor(
      {
        entityType: "image",
        title: "pretty robot",
        prompt:
          "A pretty robot, elegant and friendly, polished metallic design",
        targetEntityType: "image",
        targetEntityId: "pretty-robot",
      },
      {
        interfaceType: "test",
        userId: "test-user",
      },
    );

    expect(result.kind).toBe("handled");
    expect(enqueuedJobs).toHaveLength(1);
    expect(enqueuedJobs[0]?.data).toMatchObject({
      prompt: "A pretty robot, elegant and friendly, polished metallic design",
      title: "pretty robot",
    });
    expect(enqueuedJobs[0]?.data).not.toMatchObject({
      targetEntityType: expect.any(String),
    });
    expect(enqueuedJobs[0]?.data).not.toMatchObject({
      targetEntityId: expect.any(String),
    });
    expect(enqueuedJobs[0]?.data).not.toMatchObject({
      entityContent: expect.any(String),
    });
  });

  it("does not sniff 'OG' from the prompt — a prompt with a target generates a cover image", async () => {
    // OG rendering is reachable only via the explicit `from: { attachmentType:
    // "og-image" }` path (see next test). A prompt that happens to mention "OG"
    // must NOT be special-cased into OG rendering; it is a normal cover request.
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
        prompt: "Generate an OG image for this post",
        targetEntityType: "post",
        targetEntityId: "My Blog Post",
      },
      {
        interfaceType: "test",
        userId: "test-user",
      },
    );

    if (result.kind !== "handled") throw new Error("Expected handled result");
    if (!result.result.success) throw new Error(result.result.error);
    expect(result.result.data).toMatchObject({
      entityId: "cover-my-blog-post",
      status: "generating",
      jobId: "queued-image-job",
      attachment: {
        mediaType: "image/png",
        url: "/api/chat/attachments/image?id=cover-my-blog-post",
        source: {
          entityType: "image",
          entityId: "cover-my-blog-post",
          attachmentType: "generated",
        },
      },
    });
    expect(enqueuedJobs).toHaveLength(1);
    expect(enqueuedJobs[0]).toMatchObject({
      type: "image:image-generate",
      data: {
        prompt: "Generate an OG image for this post",
        targetEntityType: "post",
        targetEntityId: "my-blog-post",
      },
    });
  });

  it("should enqueue source-rendered image generation from explicit source", async () => {
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
        from: {
          kind: "entity-attachment",
          sourceEntityType: "post",
          sourceEntityId: "my-blog-post",
          attachmentType: "og-image",
        },
        targetEntityType: "post",
        targetEntityId: "my-blog-post",
      },
      {
        interfaceType: "test",
        userId: "test-user",
      },
    );

    if (result.kind !== "handled") throw new Error("Expected handled result");
    if (!result.result.success) throw new Error(result.result.error);
    expect(result.result.data.entityId).toBe("og-post-my-blog-post");
    expect(enqueuedJobs[0]).toMatchObject({
      type: "image:image-render-source",
      data: {
        sourceEntityType: "post",
        sourceEntityId: "my-blog-post",
        attachmentType: "og-image",
        imageId: "og-post-my-blog-post",
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
