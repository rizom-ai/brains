import { describe, expect, it } from "bun:test";
import type {
  CreateExecutionContext,
  CreateInput,
  CreateInterceptionResult,
  CreateInterceptor,
} from "@brains/plugins";
import { instantiatePluginPackageDefinition } from "@brains/plugins";
import { createPluginHarness } from "@brains/plugins/test";
import {
  createSilentLogger,
  createTempDir,
  stubMethod,
} from "@brains/test-utils";
import images from "../src";

const PACKAGE_METADATA = { name: "@brains/image-plugin", version: "0.1.0" };

const executionContext: CreateExecutionContext = {
  interfaceType: "test",
  actor: { kind: "user", userId: "test-user" },
};

const PNG_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

interface Installed {
  harness: ReturnType<typeof createPluginHarness>;
  create: (
    input: CreateInput,
    context?: CreateExecutionContext,
  ) => Promise<CreateInterceptionResult>;
  enqueued: { type: string; data: unknown }[];
}

async function install(options: { dataDir?: string } = {}): Promise<Installed> {
  const harness = createPluginHarness({
    logger: createSilentLogger("image-create"),
    ...(options.dataDir !== undefined ? { dataDir: options.dataDir } : {}),
  });
  const enqueued: { type: string; data: unknown }[] = [];
  const queue = harness.getMockShell().getJobQueueService();
  stubMethod(queue, "enqueue", async ({ type, data }) => {
    enqueued.push({ type, data });
    return "job-1";
  });
  harness.getMockShell().getJobQueueService = (): typeof queue => queue;

  const plugins = instantiatePluginPackageDefinition(
    images,
    {},
    PACKAGE_METADATA,
  );
  for (const plugin of plugins) await harness.installPlugin(plugin);

  const interceptor: CreateInterceptor | undefined = harness
    .getEntityRegistry()
    .getCreateInterceptor("image");
  if (!interceptor) throw new Error("image interceptor not registered");

  return {
    harness,
    enqueued,
    create: (input, context = executionContext) => interceptor(input, context),
  };
}

function post(
  id = "launch-post",
): Parameters<
  ReturnType<typeof createPluginHarness>["addEntities"]
>[0][number] {
  return {
    id,
    entityType: "post",
    content: "---\ntitle: The Launch\n---\nWhy we built it and for whom.",
    contentHash: `${id}-hash`,
    metadata: { title: "The Launch" },
  };
}

describe("image package registration", () => {
  it("registers the image entity type, opted out of embeddings", async () => {
    const { harness } = await install();

    const registry = harness.getEntityRegistry();
    expect(registry.getAllEntityTypes()).toContain("image");
    expect(registry.getEntityTypeConfig("image")).toMatchObject({
      embeddable: false,
      projectionSource: false,
      projectionSourceRole: "excluded",
    });

    harness.reset();
  });

  it("claims image uploads without registering a second handler", async () => {
    const { harness } = await install();

    expect(
      harness.getEntityRegistry().getUploadSaveHandler("image/png")?.entityType,
    ).toBe("image");

    harness.reset();
  });

  it("offers no tool of its own", async () => {
    const harness = createPluginHarness({
      logger: createSilentLogger("image-tools"),
    });
    const plugins = instantiatePluginPackageDefinition(
      images,
      {},
      PACKAGE_METADATA,
    );
    for (const plugin of plugins) {
      const capabilities = await harness.installPlugin(plugin);
      expect(capabilities.tools).toEqual([]);
    }

    harness.reset();
  });
});

describe("generating an image from a prompt", () => {
  it("allocates a pending image and delegates the generation", async () => {
    const { harness, create, enqueued } = await install();

    const result = await create({
      entityType: "image",
      prompt: "A lighthouse in fog",
    });

    if (result.kind !== "handled" || !result.result.success) {
      throw new Error("Expected the create to be handled");
    }
    expect(result.result.data).toMatchObject({
      entityId: "a-lighthouse-in-fog",
      status: "generating",
      jobId: "job-1",
      attachment: {
        mediaType: "image/png",
        url: "/api/chat/attachments/image?id=a-lighthouse-in-fog",
        source: { entityType: "image", attachmentType: "generated" },
      },
    });

    const pending = await harness
      .getEntityService()
      .getEntity({ entityType: "image", id: "a-lighthouse-in-fog" });
    // Format and dimensions are read out of the placeholder's own bytes, and
    // they are required metadata — a stub without them cannot be read back.
    expect(pending?.metadata).toMatchObject({
      status: "pending",
      attachmentType: "generated",
      format: "png",
      width: 1,
      height: 1,
    });
    expect(enqueued).toEqual([
      {
        type: "@brains/image-plugin:image:generate",
        data: expect.objectContaining({
          entityId: "a-lighthouse-in-fog",
          prompt: "A lighthouse in fog",
        }),
      },
    ]);

    harness.reset();
  });

  it("names the image after the target, and links it as a cover", async () => {
    const { harness, create, enqueued } = await install();
    harness.addEntities([post()]);

    const result = await create({
      entityType: "image",
      prompt: "Something evocative",
      targetEntityType: "post",
      targetEntityId: "launch-post",
    });

    if (result.kind !== "handled" || !result.result.success) {
      throw new Error("Expected the create to be handled");
    }
    expect(result.result.data.entityId).toBe("cover-launch-post");
    expect(enqueued[0]?.data).toMatchObject({
      // A cover, not an OG image: the distinction is the field, and nothing
      // about a prompt says "social preview".
      linkInto: {
        entityType: "post",
        entityId: "launch-post",
        field: "coverImageId",
      },
      // The target's own words are what a concept gets distilled from.
      entityTitle: "The Launch",
      entityContent: expect.stringContaining("Why we built it"),
    });

    harness.reset();
  });

  it("resolves a target named by title", async () => {
    // "Put a cover on The Launch" names the post the way a person would.
    const { harness, create, enqueued } = await install();
    harness.addEntities([post("launch-post-2026")]);

    await create({
      entityType: "image",
      prompt: "Something evocative",
      targetEntityType: "post",
      targetEntityId: "The Launch",
    });

    expect(enqueued[0]?.data).toMatchObject({
      linkInto: { entityId: "launch-post-2026" },
    });

    harness.reset();
  });

  it("refuses rather than generating into a target that is not there", async () => {
    const { harness, create, enqueued } = await install();

    expect(
      await create({
        entityType: "image",
        prompt: "Something evocative",
        targetEntityType: "post",
        targetEntityId: "no-such-post",
      }),
    ).toEqual({
      kind: "handled",
      result: {
        success: false,
        error: "Target entity not found: post/no-such-post",
      },
    });
    expect(enqueued).toEqual([]);

    harness.reset();
  });

  it("treats an image target as the name to use, not an entity to attach to", async () => {
    const { harness, create, enqueued } = await install();

    const result = await create({
      entityType: "image",
      prompt: "A lighthouse in fog",
      targetEntityType: "image",
      targetEntityId: "harbour-light",
    });

    if (result.kind !== "handled" || !result.result.success) {
      throw new Error("Expected the create to be handled");
    }
    expect(result.result.data.entityId).toBe("harbour-light");
    expect(enqueued[0]?.data).not.toHaveProperty("linkInto");

    harness.reset();
  });

  it("takes non-image content as the prompt", async () => {
    const { harness, create, enqueued } = await install();

    await create({
      entityType: "image",
      content: "A harbour at dusk",
    });

    expect(enqueued[0]?.data).toMatchObject({ prompt: "A harbour at dusk" });

    harness.reset();
  });

  it("stores image content as the image rather than describing one", async () => {
    // A data URL is the thing itself, so there is nothing to generate and
    // nothing to distil a concept from.
    const { harness, create, enqueued } = await install();

    const result = await create({
      entityType: "image",
      title: "Harbour Light",
      content: PNG_DATA_URL,
    });

    expect(result).toMatchObject({
      kind: "handled",
      result: { success: true, data: { status: "created" } },
    });
    expect(enqueued).toEqual([]);
    const stored = await harness
      .getEntityService()
      .getEntity({ entityType: "image", id: "harbour-light" });
    expect(stored?.content).toBe(PNG_DATA_URL);
    expect(stored?.metadata).toMatchObject({
      format: "png",
      title: "Harbour Light",
    });

    harness.reset();
  });
});

describe("rendering an image from a source attachment", () => {
  function fromOgImage(overrides: Partial<CreateInput> = {}): CreateInput {
    return {
      entityType: "image",
      from: {
        kind: "entity-attachment",
        sourceEntityType: "post",
        sourceEntityId: "launch-post",
        attachmentType: "og-image",
      },
      ...overrides,
    };
  }

  it("allocates a deterministic id and links it as the OG image", async () => {
    const { harness, create, enqueued } = await install();
    harness.addEntities([post()]);

    const result = await create(
      fromOgImage({
        targetEntityType: "post",
        targetEntityId: "launch-post",
      }),
    );

    if (result.kind !== "handled" || !result.result.success) {
      throw new Error("Expected the create to be handled");
    }
    // `og-image` shortens to `og`, because these ids become filenames.
    expect(result.result.data.entityId).toBe("og-post-launch-post");
    expect(enqueued[0]).toMatchObject({
      type: "@brains/image-plugin:image:render",
      data: {
        entityId: "og-post-launch-post",
        attachmentType: "og-image",
        dedupKey:
          "og-image:post:launch-post:resolved-attachment:launch-post-hash",
        linkInto: {
          entityType: "post",
          entityId: "launch-post",
          field: "ogImageId",
        },
      },
    });

    harness.reset();
  });

  it("delegates against the image it already rendered", async () => {
    const { harness, create, enqueued } = await install();
    harness.addEntities([
      post(),
      {
        id: "og-post-launch-post",
        entityType: "image",
        content: PNG_DATA_URL,
        contentHash: "image-hash",
        metadata: {
          format: "png",
          width: 1,
          height: 1,
          dedupKey:
            "og-image:post:launch-post:resolved-attachment:launch-post-hash",
        },
      },
    ]);

    await create(fromOgImage());

    expect(enqueued[0]?.data).toMatchObject({
      entityId: "og-post-launch-post",
      reuse: true,
    });
    expect(
      await harness.getEntityService().listEntities({ entityType: "image" }),
    ).toHaveLength(1);

    harness.reset();
  });

  it("re-renders rather than reusing when asked to replace", async () => {
    const { harness, create, enqueued } = await install();
    harness.addEntities([
      post(),
      {
        id: "og-post-launch-post",
        entityType: "image",
        content: PNG_DATA_URL,
        contentHash: "image-hash",
        metadata: {
          format: "png",
          width: 1,
          height: 1,
          dedupKey:
            "og-image:post:launch-post:resolved-attachment:launch-post-hash",
        },
      },
    ]);

    await create(fromOgImage({ replace: true }));

    expect(enqueued[0]?.data).not.toHaveProperty("reuse");

    harness.reset();
  });

  it("refuses a source that is not there", async () => {
    const { harness, create } = await install();

    expect(await create(fromOgImage())).toEqual({
      kind: "handled",
      result: {
        success: false,
        error: "Source entity not found: post/launch-post",
      },
    });

    harness.reset();
  });
});

describe("preserving an uploaded image", () => {
  async function saveUpload(
    harness: ReturnType<typeof createPluginHarness>,
    input: { filename: string; mediaType: string; content: Buffer; id: string },
  ): Promise<string> {
    const store = harness
      .getMockShell()
      .getRuntimeUploadRegistry()
      .scoped({
        namespace: "upload",
        refKind: "upload",
        routePath: "/api/chat/uploads",
        createId: () => input.id,
      });
    const record = await store.save({
      filename: input.filename,
      mediaType: input.mediaType,
      content: input.content,
    });
    return record.ref.id;
  }

  const pngBytes = Buffer.from(PNG_DATA_URL.split(",")[1] ?? "", "base64");

  it("stores the bytes as a durable image, with the caller's visibility", async () => {
    const { harness, create } = await install({
      dataDir: await createTempDir("test-image-upload-"),
    });
    const uploadId = await saveUpload(harness, {
      id: "upload-00000000-0000-4000-8000-000000000201",
      filename: "harbour.png",
      mediaType: "image/png",
      content: pngBytes,
    });

    const result = await create(
      {
        entityType: "image",
        visibility: "shared",
        from: { kind: "upload", id: uploadId },
      },
      {
        interfaceType: "web-chat",
        actor: { kind: "user", userId: "operator" },
      },
    );

    expect(result).toEqual({
      kind: "handled",
      result: {
        success: true,
        data: {
          entityId: "harbour",
          status: "created",
          attachment: {
            mediaType: "image/png",
            url: "/api/chat/attachments/image?id=harbour",
            downloadUrl: "/api/chat/attachments/image?id=harbour&download=1",
            filename: "harbour.png",
            source: {
              entityType: "image",
              entityId: "harbour",
              attachmentType: "uploaded",
            },
          },
        },
      },
    });
    const stored = await harness.getEntityService().getEntity({
      entityType: "image",
      id: "harbour",
      visibilityScope: "shared",
    });
    expect(stored?.content).toBe(PNG_DATA_URL);
    expect(stored?.metadata).toMatchObject({
      title: "harbour",
      format: "png",
      attachmentType: "uploaded",
      sourceUploadId: uploadId,
      sourceFilename: "harbour.png",
    });
    expect(stored?.visibility).toBe("shared");

    harness.reset();
  });

  it("refuses anything that is not an image", async () => {
    const { harness, create } = await install({
      dataDir: await createTempDir("test-image-upload-"),
    });
    const uploadId = await saveUpload(harness, {
      id: "upload-00000000-0000-4000-8000-000000000202",
      filename: "notes.txt",
      mediaType: "text/plain",
      content: Buffer.from("hello"),
    });

    expect(
      await create({
        entityType: "image",
        from: { kind: "upload", id: uploadId },
      }),
    ).toEqual({
      kind: "handled",
      result: {
        success: false,
        error: "Only image uploads can be preserved as image entities",
      },
    });

    harness.reset();
  });

  it("refuses an upload it cannot read", async () => {
    const { harness, create } = await install();

    expect(
      await create({
        entityType: "image",
        from: { kind: "upload", id: "upload-missing" },
      }),
    ).toEqual({
      kind: "handled",
      result: { success: false, error: "Upload ref not found" },
    });

    harness.reset();
  });
});
