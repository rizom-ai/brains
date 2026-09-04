import { describe, expect, it } from "bun:test";
import type { JobHandler } from "@brains/plugins";
import { instantiatePluginPackageDefinition } from "@brains/plugins";
import { createPluginHarness } from "@brains/plugins/test";
import {
  createMockProgressReporter,
  createSilentLogger,
  stubMethod,
} from "@brains/test-utils";
import { imageMetadataSchema } from "@brains/image";
import type { PublishMediaData } from "@brains/contracts";
import images from "../src";
import type { EntitySchema } from "@brains/sdk/entities";

const PACKAGE_METADATA = { name: "@brains/image-plugin", version: "0.1.0" };

const PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
const PNG_DATA_URL = `data:image/png;base64,${PNG_BASE64}`;
const pngBytes = Buffer.from(PNG_BASE64, "base64");

interface Installed {
  harness: ReturnType<typeof createPluginHarness>;
  run: (job: "generate" | "render", data: unknown) => Promise<unknown>;
  handler: (job: "generate" | "render") => JobHandler;
  prompts: string[];
}

async function install(
  options: {
    canGenerateImages?: boolean;
    generateObject?: <T>(
      prompt: string,
      schema: EntitySchema<T>,
    ) => Promise<{ object: T }>;
    resolveAttachment?: () => Promise<PublishMediaData | undefined>;
  } = {},
): Promise<Installed> {
  const harness = createPluginHarness({
    logger: createSilentLogger("image-jobs"),
  });
  const handlers = new Map<string, JobHandler>();
  const queue = harness.getMockShell().getJobQueueService();
  stubMethod(queue, "registerHandler", (name, handler) => {
    handlers.set(name, handler);
  });
  harness.getMockShell().getJobQueueService = (): typeof queue => queue;

  const shell = harness.getMockShell();
  const prompts: string[] = [];
  stubMethod(
    shell,
    "canGenerateImages",
    () => options.canGenerateImages ?? true,
  );
  stubMethod(shell, "generateImage", async (prompt: string) => {
    prompts.push(prompt);
    return { base64: PNG_BASE64, dataUrl: PNG_DATA_URL };
  });
  if (options.generateObject) {
    stubMethod(shell, "generateObject", options.generateObject);
  }
  if (options.resolveAttachment) {
    harness
      .getAttachments()
      .register("post", "og-image", { resolve: options.resolveAttachment });
  }

  const plugins = instantiatePluginPackageDefinition(
    images,
    {},
    PACKAGE_METADATA,
  );
  for (const plugin of plugins) await harness.installPlugin(plugin);

  const handler = (job: "generate" | "render"): JobHandler => {
    const found = handlers.get(`@brains/image-plugin:image:${job}`);
    if (!found) throw new Error(`Image ${job} handler was not registered`);
    return found;
  };

  return {
    harness,
    prompts,
    handler,
    run: (job, data): Promise<unknown> => {
      const found = handler(job);
      return found.process(
        found.validateAndParse(data),
        "job-1",
        createMockProgressReporter(),
        new AbortController().signal,
      );
    },
  };
}

function pendingImage(
  id: string,
): Parameters<
  ReturnType<typeof createPluginHarness>["addEntities"]
>[0][number] {
  return {
    id,
    entityType: "image",
    content: PNG_DATA_URL,
    contentHash: `${id}-pending-hash`,
    metadata: {
      title: id,
      alt: id,
      format: "png",
      width: 1,
      height: 1,
      status: "pending",
    },
  };
}

describe("generating an image", () => {
  it("stores what the model produced, under the allocated id", async () => {
    const { harness, run } = await install();
    harness.addEntities([pendingImage("a-lighthouse-in-fog")]);

    expect(
      await run("generate", {
        entityId: "a-lighthouse-in-fog",
        prompt: "A lighthouse in fog",
      }),
    ).toMatchObject({ success: true, entityId: "a-lighthouse-in-fog" });

    const stored = await harness
      .getEntityService()
      .getEntity({ entityType: "image", id: "a-lighthouse-in-fog" });
    expect(stored?.content).toBe(PNG_DATA_URL);
    expect(stored?.metadata).toMatchObject({
      title: "A lighthouse in fog",
      alt: "A lighthouse in fog",
      format: "png",
      attachmentType: "generated",
    });
    // The placeholder is filled in, not left beside a second image.
    expect(
      await harness.getEntityService().listEntities({ entityType: "image" }),
    ).toHaveLength(1);
    expect(stored?.metadata["status"]).toBeUndefined();

    harness.reset();
  });

  it("says so rather than failing silently when it cannot generate", async () => {
    const { harness, run } = await install({ canGenerateImages: false });
    harness.addEntities([pendingImage("a-lighthouse-in-fog")]);

    expect(
      await run("generate", {
        entityId: "a-lighthouse-in-fog",
        prompt: "A lighthouse in fog",
      }),
    ).toEqual({
      success: false,
      error: "Image generation not available: no API key configured",
    });

    const stored = await harness
      .getEntityService()
      .getEntity({ entityType: "image", id: "a-lighthouse-in-fog" });
    // Through the schema, because that is what a real write goes through — a
    // reason under a key the schema does not name reads as blank.
    expect(imageMetadataSchema.parse(stored?.metadata)).toMatchObject({
      status: "failed",
      error: expect.stringContaining("no API key"),
    });

    harness.reset();
  });

  it("distils a concept from the target's own words before drawing", async () => {
    const { harness, run, prompts } = await install({
      // Parsed through the caller's schema, which is what proves the stubbed
      // object is the shape the job asked for.
      generateObject: async <T>(
        _prompt: string,
        schema: EntitySchema<T>,
      ): Promise<{ object: T }> => ({
        object: schema.parse({
          imagePrompt: "A rope bridge between two cliffs",
        }),
      }),
    });
    harness.addEntities([pendingImage("cover-launch-post")]);

    await run("generate", {
      entityId: "cover-launch-post",
      prompt: "Cover image.",
      entityTitle: "The Launch",
      entityContent: "Why we built it and for whom.",
    });

    expect(prompts[0]).toContain("A rope bridge between two cliffs");
    expect(prompts[0]).toContain("Cover image.");

    harness.reset();
  });

  it("draws the prompt as given when distillation fails", async () => {
    // A worse subject, not an unusable one — so this is not a failed job.
    const { harness, run, prompts } = await install({
      generateObject: async <T>(): Promise<{ object: T }> => {
        throw new Error("model unavailable");
      },
    });
    harness.addEntities([pendingImage("cover-launch-post")]);

    expect(
      await run("generate", {
        entityId: "cover-launch-post",
        prompt: "Cover image.",
        entityContent: "Why we built it and for whom.",
      }),
    ).toMatchObject({ success: true });
    expect(prompts[0]).toContain("Cover image.");

    harness.reset();
  });

  it("does not distil from an image handed over as content", async () => {
    let distilled = 0;
    const { harness, run } = await install({
      generateObject: async <T>(
        _prompt: string,
        schema: EntitySchema<T>,
      ): Promise<{ object: T }> => {
        distilled += 1;
        return { object: schema.parse({ imagePrompt: "unused" }) };
      },
    });
    harness.addEntities([pendingImage("a-lighthouse-in-fog")]);

    await run("generate", {
      entityId: "a-lighthouse-in-fog",
      prompt: "A lighthouse in fog",
      entityContent: PNG_DATA_URL,
    });

    expect(distilled).toBe(0);

    harness.reset();
  });

  it("leaves the target pointing at the cover it generated", async () => {
    const { harness, run } = await install();
    harness.addEntities([
      pendingImage("cover-launch-post"),
      {
        id: "launch-post",
        entityType: "post",
        content: "---\ntitle: The Launch\ncoverImageId: old-cover\n---\nBody",
        contentHash: "post-hash",
        metadata: { title: "The Launch" },
      },
    ]);

    await run("generate", {
      entityId: "cover-launch-post",
      prompt: "Something evocative",
      linkInto: {
        entityType: "post",
        entityId: "launch-post",
        field: "coverImageId",
      },
    });

    const stored = await harness
      .getEntityService()
      .getEntity({ entityType: "post", id: "launch-post" });
    expect(stored?.content).toContain("coverImageId: cover-launch-post");
    expect(stored?.content).not.toContain("old-cover");

    harness.reset();
  });

  it("rejects job data that does not say what to generate", async () => {
    const { harness, handler } = await install();

    const generate = handler("generate");
    expect(
      generate.validateAndParse({ entityId: "x", prompt: "A lighthouse" }),
    ).not.toBeNull();
    expect(generate.validateAndParse({ entityId: "x" })).toBeNull();
    expect(
      generate.validateAndParse({
        entityId: "x",
        prompt: "A lighthouse",
        aspectRatio: "3:2",
      }),
    ).toBeNull();
    // The runtime's own fields survive a schema that does not name them.
    expect(
      generate.validateAndParse({
        entityId: "x",
        prompt: "A lighthouse",
        expectedContentHash: "hash-1",
      }),
    ).toMatchObject({ expectedContentHash: "hash-1" });

    harness.reset();
  });
});

describe("rendering an image", () => {
  const ogAttachment: PublishMediaData = {
    type: "image",
    data: pngBytes,
    mimeType: "image/png",
    filename: "og.png",
  };

  function renderJob(overrides: Record<string, unknown> = {}): unknown {
    return {
      entityId: "og-post-launch-post",
      sourceEntityType: "post",
      sourceEntityId: "launch-post",
      attachmentType: "og-image",
      dedupKey: "og-image:post:launch-post:resolved-attachment:post-hash",
      ...overrides,
    };
  }

  it("stores what the attachment provider produced", async () => {
    const { harness, run } = await install({
      resolveAttachment: async () => ogAttachment,
    });
    harness.addEntities([pendingImage("og-post-launch-post")]);

    expect(await run("render", renderJob())).toMatchObject({
      success: true,
      entityId: "og-post-launch-post",
    });

    const stored = await harness
      .getEntityService()
      .getEntity({ entityType: "image", id: "og-post-launch-post" });
    expect(stored?.content).toBe(PNG_DATA_URL);
    expect(stored?.metadata).toMatchObject({
      format: "png",
      width: 1,
      height: 1,
      sourceEntityType: "post",
      sourceEntityId: "launch-post",
      attachmentType: "og-image",
      dedupKey: "og-image:post:launch-post:resolved-attachment:post-hash",
    });

    harness.reset();
  });

  it("marks the pending image failed when no provider answers", async () => {
    const { harness, run } = await install();
    harness.addEntities([pendingImage("og-post-launch-post")]);

    expect(await run("render", renderJob())).toEqual({
      success: false,
      error: "No attachment provider found for post/og-image",
    });

    const stored = await harness
      .getEntityService()
      .getEntity({ entityType: "image", id: "og-post-launch-post" });
    expect(imageMetadataSchema.parse(stored?.metadata)).toMatchObject({
      status: "failed",
      error: expect.stringContaining("No attachment provider"),
    });

    harness.reset();
  });

  it("refuses media that is not an image", async () => {
    const { harness, run } = await install({
      resolveAttachment: async () => ({
        type: "document",
        data: Buffer.from("%PDF-1.4"),
        mimeType: "application/pdf",
        filename: "og.pdf",
      }),
    });
    harness.addEntities([pendingImage("og-post-launch-post")]);

    expect(await run("render", renderJob())).toEqual({
      success: false,
      error: "Attachment provider returned document; expected image",
    });

    harness.reset();
  });

  it("reuses the image the route found instead of asking for it again", async () => {
    let asked = 0;
    const { harness, run } = await install({
      resolveAttachment: async () => {
        asked += 1;
        return ogAttachment;
      },
    });
    harness.addEntities([
      {
        id: "og-post-launch-post",
        entityType: "image",
        content: PNG_DATA_URL,
        contentHash: "image-hash",
        metadata: { format: "png", width: 1, height: 1, title: "og" },
      },
    ]);

    expect(await run("render", renderJob({ reuse: true }))).toMatchObject({
      success: true,
      entityId: "og-post-launch-post",
    });
    expect(asked).toBe(0);

    harness.reset();
  });

  it("leaves the source pointing at the preview it rendered", async () => {
    const { harness, run } = await install({
      resolveAttachment: async () => ogAttachment,
    });
    harness.addEntities([
      pendingImage("og-post-launch-post"),
      {
        id: "launch-post",
        entityType: "post",
        content: "---\ntitle: The Launch\ncoverImageId: a-cover\n---\nBody",
        contentHash: "post-hash",
        metadata: { title: "The Launch" },
      },
    ]);

    await run(
      "render",
      renderJob({
        linkInto: {
          entityType: "post",
          entityId: "launch-post",
          field: "ogImageId",
        },
      }),
    );

    const stored = await harness
      .getEntityService()
      .getEntity({ entityType: "post", id: "launch-post" });
    // The OG image goes in its own field; the cover is a different concept
    // and is left alone.
    expect(stored?.content).toContain("ogImageId: og-post-launch-post");
    expect(stored?.content).toContain("coverImageId: a-cover");

    harness.reset();
  });
});
