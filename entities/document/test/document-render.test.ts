import { describe, expect, it } from "bun:test";
import type { JobHandler } from "@brains/plugins";
import { instantiatePluginPackageDefinition } from "@brains/plugins";
import { createPluginHarness } from "@brains/plugins/test";
import {
  createMockProgressReporter,
  createSilentLogger,
  stubMethod,
} from "@brains/test-utils";
import { createPdfDataUrl, documentMetadataSchema } from "@brains/document";
import type { PublishMediaData } from "@brains/contracts";
import documents from "../src";

const PACKAGE_METADATA = { name: "@brains/document-plugin", version: "0.1.0" };

const carouselPdf = Buffer.from("%PDF-1.7\n/Type /Page\n%carousel");

function documentAttachment(data: Buffer): PublishMediaData {
  return {
    type: "document",
    data,
    mimeType: "application/pdf",
    filename: "carousel.pdf",
  };
}

interface Installed {
  harness: ReturnType<typeof createPluginHarness>;
  render: (data: unknown) => Promise<unknown>;
  handler: JobHandler;
}

/**
 * Install the package and hand back its render job, the way the queue reaches
 * it. The attachment provider is what renders — the job asks the brain for
 * "this deck as a carousel" and stores what comes back.
 */
async function install(
  resolve: (request: {
    sourceEntityType: string;
    sourceEntityId: string;
    attachmentType: string;
  }) => Promise<PublishMediaData | undefined>,
): Promise<Installed> {
  const harness = createPluginHarness({
    logger: createSilentLogger("document-render"),
  });
  const handlers = new Map<string, JobHandler>();
  const queue = harness.getMockShell().getJobQueueService();
  stubMethod(queue, "registerHandler", (name, handler) => {
    handlers.set(name, handler);
  });
  harness.getMockShell().getJobQueueService = (): typeof queue => queue;

  // A real provider, because that is what renders: the job asks the brain
  // for "this deck as a carousel" and stores whatever comes back.
  harness.getAttachments().register("deck", "carousel", { resolve });

  const plugins = instantiatePluginPackageDefinition(
    documents,
    {},
    PACKAGE_METADATA,
  );
  for (const plugin of plugins) await harness.installPlugin(plugin);

  const handler = handlers.get("@brains/document-plugin:document:render");
  if (!handler) throw new Error("Document render handler was not registered");

  return {
    harness,
    handler,
    render: (data) =>
      handler.process(
        handler.validateAndParse(data),
        "job-1",
        createMockProgressReporter(),
        new AbortController().signal,
      ),
  };
}

function renderJob(overrides: Record<string, unknown> = {}): unknown {
  return {
    entityId: "carousel",
    sourceEntityType: "deck",
    sourceEntityId: "deck-1",
    attachmentType: "carousel",
    dedupKey: "carousel:deck:deck-1:resolved-attachment:deck-hash",
    ...overrides,
  };
}

function pendingDocument(
  id = "carousel",
): Parameters<
  ReturnType<typeof createPluginHarness>["addEntities"]
>[0][number] {
  return {
    id,
    entityType: "document",
    content: createPdfDataUrl(Buffer.from("%PDF-1.4\n%pending")),
    contentHash: `${id}-pending-hash`,
    metadata: {
      title: id,
      mimeType: "application/pdf",
      filename: `${id}.pdf`,
      status: "pending",
      sourceEntityType: "deck",
      sourceEntityId: "deck-1",
      attachmentType: "carousel",
    },
  };
}

describe("rendering a document", () => {
  it("stores what the attachment provider produced", async () => {
    const { harness, render } = await install(async () =>
      documentAttachment(carouselPdf),
    );
    harness.addEntities([pendingDocument()]);

    expect(await render(renderJob())).toMatchObject({
      success: true,
      entityId: "carousel",
    });

    const document = await harness
      .getEntityService()
      .getEntity({ entityType: "document", id: "carousel" });
    expect(document?.content).toBe(createPdfDataUrl(carouselPdf));
    expect(document?.metadata).toMatchObject({
      mimeType: "application/pdf",
      filename: "carousel.pdf",
      pageCount: 1,
      sourceEntityType: "deck",
      sourceEntityId: "deck-1",
      attachmentType: "carousel",
      dedupKey: "carousel:deck:deck-1:resolved-attachment:deck-hash",
    });
    // The placeholder is filled in, not left beside a second document.
    expect(
      await harness.getEntityService().listEntities({ entityType: "document" }),
    ).toHaveLength(1);
    expect(document?.metadata["status"]).toBeUndefined();

    harness.reset();
  });

  it("marks the pending document failed when no provider answers", async () => {
    const { harness, render } = await install(async () => undefined);
    harness.addEntities([pendingDocument()]);

    expect(await render(renderJob())).toEqual({
      success: false,
      error: "No attachment provider found for deck/carousel",
    });

    const document = await harness
      .getEntityService()
      .getEntity({ entityType: "document", id: "carousel" });
    // Through the schema, because that is what a real write goes through —
    // a reason under a key the schema does not name is stripped, and the
    // failure reads as blank.
    expect(documentMetadataSchema.parse(document?.metadata)).toMatchObject({
      status: "failed",
      error: expect.stringContaining("No attachment provider"),
    });

    harness.reset();
  });

  it("refuses media that is not a document", async () => {
    const { harness, render } = await install(async () => ({
      type: "image",
      data: Buffer.from("not-a-pdf"),
      mimeType: "image/png",
      filename: "carousel.png",
    }));
    harness.addEntities([pendingDocument()]);

    expect(await render(renderJob())).toEqual({
      success: false,
      error: "Attachment provider returned image; expected document",
    });

    harness.reset();
  });

  it("refuses a document larger than it will store", async () => {
    const { harness, render } = await install(async () =>
      documentAttachment(carouselPdf),
    );
    harness.addEntities([pendingDocument()]);

    expect(await render(renderJob({ maxBytes: 4 }))).toEqual({
      success: false,
      error: expect.stringContaining("exceeds maxBytes=4"),
    });

    harness.reset();
  });

  it("refuses a document with more pages than it will store", async () => {
    const { harness, render } = await install(async () =>
      documentAttachment(
        Buffer.from(`%PDF-1.7\n${"/Type /Page\n".repeat(30)}`),
      ),
    );
    harness.addEntities([pendingDocument()]);

    expect(await render(renderJob({ maxPageCount: 2 }))).toEqual({
      success: false,
      error: expect.stringContaining("exceeding maxPageCount=2"),
    });

    harness.reset();
  });

  it("reuses the document the route found instead of asking for it again", async () => {
    let asked = 0;
    const { harness, render } = await install(async () => {
      asked += 1;
      return documentAttachment(carouselPdf);
    });
    const existing = createPdfDataUrl(
      Buffer.from("%PDF-1.4\n/Type /Page\n%old"),
    );
    harness.addEntities([
      {
        id: "existing-carousel",
        entityType: "document",
        content: existing,
        contentHash: "existing-hash",
        metadata: {
          mimeType: "application/pdf",
          filename: "existing-carousel.pdf",
          dedupKey: "carousel:deck:deck-1:resolved-attachment:deck-hash",
        },
      },
    ]);

    expect(
      await render(renderJob({ entityId: "existing-carousel", reuse: true })),
    ).toMatchObject({ success: true, entityId: "existing-carousel" });

    expect(asked).toBe(0);
    const document = await harness
      .getEntityService()
      .getEntity({ entityType: "document", id: "existing-carousel" });
    expect(document?.content).toBe(existing);

    harness.reset();
  });

  it("leaves the source pointing at what it rendered", async () => {
    const { harness, render } = await install(async () =>
      documentAttachment(carouselPdf),
    );
    harness.addEntities([
      pendingDocument(),
      {
        id: "post-1",
        entityType: "social-post",
        content:
          "---\ntitle: Post\ndocuments:\n  - id: old-carousel\n  - id: unrelated\n---\nBody",
        contentHash: "post-hash",
        metadata: { title: "Post" },
      },
    ]);

    await render(
      renderJob({
        linkInto: {
          entityType: "social-post",
          entityId: "post-1",
          list: "documents",
          replaces: ["old-carousel"],
        },
      }),
    );

    const post = await harness
      .getEntityService()
      .getEntity({ entityType: "social-post", id: "post-1" });
    expect(post?.content).toContain("id: carousel");
    expect(post?.content).toContain("id: unrelated");
    expect(post?.content).not.toContain("id: old-carousel");

    harness.reset();
  });

  it("rejects job data that does not name what to render", async () => {
    const { harness, handler } = await install(async () =>
      documentAttachment(carouselPdf),
    );

    expect(handler.validateAndParse(renderJob())).not.toBeNull();
    expect(handler.validateAndParse({ entityId: "carousel" })).toBeNull();
    // The runtime's own fields survive a schema that does not name them.
    expect(
      handler.validateAndParse(
        renderJob({ expectedContentHash: "carousel-pending-hash" }),
      ),
    ).toMatchObject({ expectedContentHash: "carousel-pending-hash" });

    harness.reset();
  });

  it("leaves an edit made while it ran in place", async () => {
    const { harness, render } = await install(async () =>
      documentAttachment(carouselPdf),
    );
    harness.addEntities([pendingDocument()]);

    const outcome = await render(
      renderJob({ expectedContentHash: "a-hash-from-before-the-edit" }),
    );

    expect(outcome).toMatchObject({ status: "superseded" });

    harness.reset();
  });
});
