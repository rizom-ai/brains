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
import documents from "../src";

const PACKAGE_METADATA = { name: "@brains/document-plugin", version: "0.1.0" };

const executionContext: CreateExecutionContext = {
  interfaceType: "test",
  actor: { kind: "user", userId: "test-user" },
};

interface Installed {
  harness: ReturnType<typeof createPluginHarness>;
  create: (
    input: CreateInput,
    context?: CreateExecutionContext,
  ) => Promise<CreateInterceptionResult>;
  enqueued: { type: string; data: unknown }[];
}

/**
 * Install the package and hand back the create route, the way `system_create`
 * reaches it.
 */
async function install(options: { dataDir?: string } = {}): Promise<Installed> {
  const harness = createPluginHarness({
    logger: createSilentLogger("document-create"),
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
    documents,
    {},
    PACKAGE_METADATA,
  );
  for (const plugin of plugins) await harness.installPlugin(plugin);

  const interceptor: CreateInterceptor | undefined = harness
    .getEntityRegistry()
    .getCreateInterceptor("document");
  if (!interceptor) throw new Error("document interceptor not registered");

  return {
    harness,
    enqueued,
    create: (input, context = executionContext) => interceptor(input, context),
  };
}

function fromCarousel(overrides: Partial<CreateInput> = {}): CreateInput {
  return {
    entityType: "document",
    from: {
      kind: "entity-attachment",
      sourceEntityType: "deck",
      sourceEntityId: "deck-1",
      attachmentType: "carousel",
    },
    ...overrides,
  };
}

describe("document package registration", () => {
  it("registers the document entity type, opted out of embeddings", async () => {
    const { harness } = await install();

    const registry = harness.getEntityRegistry();
    expect(registry.getAllEntityTypes()).toContain("document");
    expect(registry.getEntityTypeConfig("document")).toMatchObject({
      embeddable: false,
      projectionSource: false,
      projectionSourceRole: "excluded",
    });

    harness.reset();
  });

  it("claims PDF uploads without registering a second handler", async () => {
    // The upload endpoint routes by media type and `system_create` routes by
    // ref kind, but they are one decision. Declaring the media types on the
    // upload route registers both.
    const { harness } = await install();

    expect(
      harness.getEntityRegistry().getUploadSaveHandler("application/pdf")
        ?.entityType,
    ).toBe("document");

    harness.reset();
  });

  it("offers no tool of its own", async () => {
    // Documents are made through system_create and system_generate. A
    // document_generate tool beside them is a second way to ask for the
    // same thing.
    const harness = createPluginHarness({
      logger: createSilentLogger("document-tools"),
    });
    const plugins = instantiatePluginPackageDefinition(
      documents,
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

describe("creating a document from a source attachment", () => {
  it("allocates a pending document, delegates the render, and links back", async () => {
    const { harness, create, enqueued } = await install({
      dataDir: await createTempDir("test-document-source-"),
    });
    harness.addEntities([
      {
        id: "deck-1",
        entityType: "deck",
        content: "---\ntitle: Deck\n---\nSlides",
        contentHash: "deck-hash",
        metadata: { title: "Deck" },
      },
    ]);

    const result = await create(
      fromCarousel({
        targetEntityType: "social-post",
        targetEntityId: "post-1",
      }),
    );

    if (result.kind !== "handled" || !result.result.success) {
      throw new Error("Expected the create to be handled");
    }
    const entityId = result.result.data.entityId;
    // The id is allocated before the render, so the caller gets a link to
    // the PDF straight away rather than after the work finishes.
    expect(result.result.data).toMatchObject({
      status: "generating",
      jobId: "job-1",
      attachment: {
        mediaType: "application/pdf",
        url: `/api/chat/attachments/document?id=${entityId}`,
        downloadUrl: `/api/chat/attachments/document?id=${entityId}&download=1`,
        filename: `${entityId}.pdf`,
        source: {
          entityType: "document",
          entityId,
          attachmentType: "carousel",
        },
      },
    });

    const pending = await harness
      .getEntityService()
      .getEntity({ entityType: "document", id: String(entityId) });
    expect(pending?.metadata).toMatchObject({
      status: "pending",
      sourceEntityType: "deck",
      sourceEntityId: "deck-1",
      attachmentType: "carousel",
    });

    expect(enqueued).toEqual([
      {
        type: "@brains/document-plugin:document:render",
        data: expect.objectContaining({
          entityId,
          sourceEntityType: "deck",
          sourceEntityId: "deck-1",
          attachmentType: "carousel",
          // What the render should leave the post pointing at. The document
          // package may not write a social post, so it says rather than does.
          linkInto: {
            entityType: "social-post",
            entityId: "post-1",
            list: "documents",
          },
        }),
      },
    ]);

    harness.reset();
  });

  it("keys the dedup key on the source's content, so an edit re-renders", async () => {
    const { harness, create, enqueued } = await install();
    harness.addEntities([
      {
        id: "deck-1",
        entityType: "deck",
        content: "---\ntitle: Deck\n---\nSlides",
        contentHash: "deck-hash",
        metadata: { title: "Deck" },
      },
    ]);

    await create(fromCarousel());

    expect(enqueued[0]?.data).toMatchObject({
      dedupKey: "carousel:deck:deck-1:resolved-attachment:deck-hash",
    });

    harness.reset();
  });

  it("delegates against the document it already rendered", async () => {
    // Rendering the same deck twice reuses one document, unlike importing the
    // same file twice. The route is what knows which, so it says.
    const { harness, create, enqueued } = await install();
    harness.addEntities([
      {
        id: "post-1",
        entityType: "post",
        content: "---\ntitle: Post\n---\nBody",
        contentHash: "source-hash",
        metadata: { title: "Post" },
      },
      {
        id: "existing-printable",
        entityType: "document",
        content: "data:application/pdf;base64,JVBERi0=",
        metadata: {
          mimeType: "application/pdf",
          filename: "post-printable.pdf",
          dedupKey: "printable:post:post-1:resolved-attachment:source-hash",
        },
      },
    ]);

    const result = await create({
      entityType: "document",
      from: {
        kind: "entity-attachment",
        sourceEntityType: "post",
        sourceEntityId: "post-1",
        attachmentType: "printable",
      },
    });

    expect(result).toMatchObject({
      kind: "handled",
      result: {
        success: true,
        data: {
          entityId: "existing-printable",
          attachment: {
            url: "/api/chat/attachments/document?id=existing-printable",
            source: {
              entityType: "document",
              entityId: "existing-printable",
              attachmentType: "printable",
            },
          },
        },
      },
    });
    // No second document, and the job is told not to re-render.
    expect(
      await harness.getEntityService().listEntities({ entityType: "document" }),
    ).toHaveLength(1);
    expect(enqueued[0]?.data).toMatchObject({
      entityId: "existing-printable",
      reuse: true,
    });

    harness.reset();
  });

  it("never reuses a document that is still pending or has failed", async () => {
    const { harness, create } = await install();
    harness.addEntities([
      {
        id: "post-1",
        entityType: "post",
        content: "---\ntitle: Post\n---\nBody",
        contentHash: "source-hash",
        metadata: { title: "Post" },
      },
      {
        id: "half-written",
        entityType: "document",
        content: "data:application/pdf;base64,JVBERi0=",
        metadata: {
          mimeType: "application/pdf",
          filename: "half-written.pdf",
          status: "failed",
          dedupKey: "printable:post:post-1:resolved-attachment:source-hash",
        },
      },
    ]);

    const result = await create({
      entityType: "document",
      from: {
        kind: "entity-attachment",
        sourceEntityType: "post",
        sourceEntityId: "post-1",
        attachmentType: "printable",
      },
    });

    if (result.kind !== "handled" || !result.result.success) {
      throw new Error("Expected the create to be handled");
    }
    expect(result.result.data.entityId).not.toBe("half-written");

    harness.reset();
  });

  it("replace renders a new document and drops the one it supersedes", async () => {
    const { harness, create, enqueued } = await install();
    harness.addEntities([
      {
        id: "deck-1",
        entityType: "deck",
        content: "---\ntitle: Deck\n---\nSlides",
        contentHash: "deck-hash",
        metadata: { title: "Deck" },
      },
      {
        id: "old-carousel",
        entityType: "document",
        content: "data:application/pdf;base64,JVBERi0=",
        metadata: {
          mimeType: "application/pdf",
          filename: "old-carousel.pdf",
          sourceEntityType: "deck",
          sourceEntityId: "deck-1",
          attachmentType: "carousel",
          dedupKey: "carousel:deck:deck-1:resolved-attachment:deck-hash",
        },
      },
      {
        id: "post-1",
        entityType: "social-post",
        content:
          "---\ntitle: Post\ndocuments:\n  - id: old-carousel\n  - id: unrelated\n---\nBody",
        contentHash: "post-hash",
        metadata: { title: "Post" },
      },
    ]);

    const result = await create(
      fromCarousel({
        replace: true,
        targetEntityType: "social-post",
        targetEntityId: "post-1",
      }),
    );

    if (result.kind !== "handled" || !result.result.success) {
      throw new Error("Expected the create to be handled");
    }
    expect(result.result.data.entityId).not.toBe("old-carousel");
    // The superseded reference is named by the route — only it knows which of
    // its own documents came from the same source attachment. A reference to
    // something else is left alone, and the old document itself is kept.
    expect(enqueued[0]?.data).toMatchObject({
      linkInto: {
        entityType: "social-post",
        entityId: "post-1",
        list: "documents",
        replaces: ["old-carousel"],
      },
    });
    expect(
      await harness
        .getEntityService()
        .getEntity({ entityType: "document", id: "old-carousel" }),
    ).not.toBeNull();

    harness.reset();
  });

  it("bounds the id it derives while keeping content-hash variants apart", async () => {
    const { harness, create } = await install();
    const longId = "s".repeat(200);
    harness.addEntities(
      ["a", "b"].map((hash) => ({
        id: `${longId}-${hash}`,
        entityType: "deck",
        content: `---\ntitle: Deck ${hash}\n---\nSlides`,
        contentHash: `hash-${hash}`,
        metadata: { title: `Deck ${hash}` },
      })),
    );

    const ids = await Promise.all(
      ["a", "b"].map(async (hash) => {
        const result = await create(
          fromCarousel({
            from: {
              kind: "entity-attachment",
              sourceEntityType: "deck",
              sourceEntityId: `${longId}-${hash}`,
              attachmentType: "carousel",
            },
          }),
        );
        if (result.kind !== "handled" || !result.result.success) {
          throw new Error("Expected the create to be handled");
        }
        return String(result.result.data.entityId);
      }),
    );

    for (const id of ids) expect(id.length).toBeLessThanOrEqual(80);
    expect(ids[0]).not.toBe(ids[1]);

    harness.reset();
  });
});

describe("preserving an uploaded PDF", () => {
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

  it("stores the bytes as a durable document, with the caller's visibility", async () => {
    const { harness, create } = await install({
      dataDir: await createTempDir("test-document-upload-"),
    });
    const uploadId = await saveUpload(harness, {
      id: "upload-00000000-0000-4000-8000-000000000101",
      filename: "brief.pdf",
      mediaType: "application/pdf",
      content: Buffer.from("%PDF-1.4\n%EOF\n"),
    });

    const result = await create(
      {
        entityType: "document",
        title: "Brief",
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
          entityId: "brief",
          status: "created",
          attachment: {
            mediaType: "application/pdf",
            url: "/api/chat/attachments/document?id=brief",
            downloadUrl: "/api/chat/attachments/document?id=brief&download=1",
            filename: "brief.pdf",
            source: {
              entityType: "document",
              entityId: "brief",
              attachmentType: "uploaded",
            },
          },
        },
      },
    });
    const entity = await harness.getEntityService().getEntity({
      entityType: "document",
      id: "brief",
      visibilityScope: "shared",
    });
    expect(entity?.content).toBe(
      `data:application/pdf;base64,${Buffer.from("%PDF-1.4\n%EOF\n").toString("base64")}`,
    );
    expect(entity?.metadata).toMatchObject({
      title: "Brief",
      filename: "brief.pdf",
      mimeType: "application/pdf",
      attachmentType: "uploaded",
      sourceUploadId: uploadId,
    });
    expect(entity?.visibility).toBe("shared");

    harness.reset();
  });

  it("refuses anything that is not a PDF", async () => {
    const { harness, create } = await install({
      dataDir: await createTempDir("test-document-upload-"),
    });
    const uploadId = await saveUpload(harness, {
      id: "upload-00000000-0000-4000-8000-000000000102",
      filename: "notes.txt",
      mediaType: "text/plain",
      content: Buffer.from("hello"),
    });

    expect(
      await create({
        entityType: "document",
        from: { kind: "upload", id: uploadId },
      }),
    ).toEqual({
      kind: "handled",
      result: {
        success: false,
        error: "Only PDF uploads can be preserved as document entities",
      },
    });

    harness.reset();
  });

  it("refuses an upload it cannot read", async () => {
    const { harness, create } = await install();

    expect(
      await create({
        entityType: "document",
        from: { kind: "upload", id: "upload-missing" },
      }),
    ).toEqual({
      kind: "handled",
      result: { success: false, error: "Upload ref not found" },
    });

    harness.reset();
  });

  it("refuses a filename it cannot derive an id from", async () => {
    const { harness, create } = await install({
      dataDir: await createTempDir("test-document-upload-"),
    });
    const uploadId = await saveUpload(harness, {
      id: "upload-00000000-0000-4000-8000-000000000103",
      filename: "???.pdf",
      mediaType: "application/pdf",
      content: Buffer.from("%PDF-1.4\n%EOF\n"),
    });

    expect(
      await create({
        entityType: "document",
        from: { kind: "upload", id: uploadId },
      }),
    ).toEqual({
      kind: "handled",
      result: {
        success: false,
        error:
          "Could not derive a document id from the uploaded filename. Provide a title.",
      },
    });

    harness.reset();
  });
});
