import { beforeEach, describe, expect, it } from "bun:test";
import { z } from "@brains/utils/zod";
import { ProgressReporter } from "@brains/utils/progress";
import {
  BaseEntityAdapter,
  baseEntitySchema,
  createMockShell,
  createServicePluginContext,
  type ServicePluginContext,
} from "@brains/plugins/test";
import { createMockLogger, createSilentLogger } from "@brains/test-utils";
import {
  createPdfDataUrl,
  documentAdapter,
  documentSchema,
} from "@brains/document";
import {
  DocumentGenerationJobHandler,
  getDocumentId,
} from "../../src/handlers/documentGenerationHandler";

const socialPostStubSchema = baseEntitySchema.extend({
  entityType: z.literal("social-post"),
});
type SocialPostStub = z.infer<typeof socialPostStubSchema>;

class SocialPostStubAdapter extends BaseEntityAdapter<SocialPostStub> {
  constructor() {
    super({
      entityType: "social-post",
      purpose: "Test entity for unit tests.",
      schema: socialPostStubSchema,
      frontmatterSchema: z.object({}),
    });
  }

  public fromMarkdown(content: string): Partial<SocialPostStub> {
    return { entityType: "social-post" as const, content };
  }
}

const pdfBuffer = Buffer.from("%PDF-1.7\n%carousel");

function progressReporter(): ProgressReporter {
  const reporter = ProgressReporter.from(async () => undefined);
  if (!reporter) throw new Error("Failed to create progress reporter");
  return reporter;
}

function expectErrorMessage(error: unknown, message: string): void {
  if (!(error instanceof Error)) {
    throw new Error("Expected an Error to be thrown");
  }
  expect(error.message).toContain(message);
}

describe("DocumentGenerationJobHandler", () => {
  let context: ServicePluginContext;

  beforeEach((): void => {
    const shell = createMockShell({ logger: createSilentLogger() });
    shell
      .getEntityRegistry()
      .registerEntityType("document", documentSchema, documentAdapter);
    shell
      .getEntityRegistry()
      .registerEntityType(
        "social-post",
        socialPostStubSchema,
        new SocialPostStubAdapter(),
      );
    context = createServicePluginContext(shell, "document");
  });

  it("renders and stores a generated PDF document", async () => {
    const handler = new DocumentGenerationJobHandler(
      createSilentLogger(),
      context,
      { renderPdf: async (): Promise<Buffer> => pdfBuffer },
    );

    const result = await handler.process(
      {
        renderUrl: "http://localhost/_media/carousel/template/post-1",
        sourceEntityType: "social-post",
        sourceEntityId: "post-1",
        attachmentType: "carousel",
        filename: "carousel.pdf",
        pageCount: 3,
        maxPageCount: 10,
        maxBytes: 1024,
        timeoutMs: 1000,
      },
      "job-1",
      progressReporter(),
    );

    expect(result).toEqual({
      success: true,
      documentId: "carousel",
      reused: false,
    });

    const document = await context.entityService.getEntity({
      entityType: "document",
      id: "carousel",
    });
    expect(document?.content).toBe(createPdfDataUrl(pdfBuffer));
    expect(document?.metadata).toMatchObject({
      mimeType: "application/pdf",
      filename: "carousel.pdf",
      pageCount: 3,
      sourceEntityType: "social-post",
      sourceEntityId: "post-1",
      attachmentType: "carousel",
    });
  });

  it("updates an existing pending document when generation completes", async () => {
    await context.entityService.createEntity({
      entity: {
        id: "carousel",
        entityType: "document",
        content: createPdfDataUrl(Buffer.from("%PDF-1.4\n%pending")),
        metadata: {
          title: "carousel",
          mimeType: "application/pdf",
          filename: "carousel.pdf",
          status: "pending",
          sourceEntityType: "social-post",
          sourceEntityId: "post-1",
          attachmentType: "carousel",
        },
      },
    });

    const handler = new DocumentGenerationJobHandler(
      createSilentLogger(),
      context,
      { renderPdf: async (): Promise<Buffer> => pdfBuffer },
    );

    await handler.process(
      {
        renderUrl: "http://localhost/_media/carousel/template/post-1",
        sourceEntityType: "social-post",
        sourceEntityId: "post-1",
        attachmentType: "carousel",
        filename: "carousel.pdf",
      },
      "job-1",
      progressReporter(),
    );

    const document = await context.entityService.getEntity({
      entityType: "document",
      id: "carousel",
    });
    expect(document?.content).toBe(createPdfDataUrl(pdfBuffer));
    expect(document?.metadata).toMatchObject({
      status: "draft",
      filename: "carousel.pdf",
      sourceEntityType: "social-post",
      sourceEntityId: "post-1",
      attachmentType: "carousel",
    });
  });

  it("marks a pending document failed when generation fails", async () => {
    await context.entityService.createEntity({
      entity: {
        id: "carousel",
        entityType: "document",
        content: createPdfDataUrl(Buffer.from("%PDF-1.4\n%pending")),
        metadata: {
          title: "carousel",
          mimeType: "application/pdf",
          filename: "carousel.pdf",
          status: "pending",
        },
      },
    });

    const handler = new DocumentGenerationJobHandler(
      createSilentLogger(),
      context,
      {
        renderPdf: async (): Promise<Buffer> => {
          throw new Error("render failed");
        },
      },
    );

    try {
      await handler.process(
        {
          renderUrl: "http://localhost/_media/carousel/template/post-1",
          sourceEntityType: "social-post",
          sourceEntityId: "post-1",
          attachmentType: "carousel",
          filename: "carousel.pdf",
        },
        "job-1",
        progressReporter(),
      );
    } catch (error) {
      expectErrorMessage(error, "render failed");
    }

    const document = await context.entityService.getEntity({
      entityType: "document",
      id: "carousel",
    });
    expect(document?.metadata).toMatchObject({
      status: "failed",
      processingError: expect.stringContaining("render failed"),
    });
  });

  it("reuses an existing document with the same dedup key", async () => {
    await context.entityService.createEntity({
      entity: {
        id: "existing-doc",
        entityType: "document",
        content: createPdfDataUrl(pdfBuffer),
        metadata: {
          mimeType: "application/pdf",
          filename: "existing.pdf",
          dedupKey: "same-key",
        },
      },
    });

    const handler = new DocumentGenerationJobHandler(
      createSilentLogger(),
      context,
      {
        renderPdf: async (): Promise<Buffer> => {
          throw new Error("should not render");
        },
      },
    );

    const result = await handler.process(
      {
        renderUrl: "http://localhost/_media/carousel/template/post-1",
        sourceEntityType: "social-post",
        sourceEntityId: "post-1",
        attachmentType: "carousel",
        dedupKey: "same-key",
      },
      "job-1",
      progressReporter(),
    );

    expect(result).toEqual({
      success: true,
      documentId: "existing-doc",
      reused: true,
    });
  });

  it("creates the requested document id when a different deduped document exists", async () => {
    await context.entityService.createEntity({
      entity: {
        id: "existing-doc",
        entityType: "document",
        content: createPdfDataUrl(pdfBuffer),
        metadata: {
          mimeType: "application/pdf",
          filename: "existing.pdf",
          dedupKey: "same-key",
        },
      },
    });

    const requestedPdf = Buffer.from("%PDF-1.7\n%requested");
    const handler = new DocumentGenerationJobHandler(
      createSilentLogger(),
      context,
      { renderPdf: async (): Promise<Buffer> => requestedPdf },
    );

    const result = await handler.process(
      {
        renderUrl: "http://localhost/_media/carousel/template/post-1",
        sourceEntityType: "social-post",
        sourceEntityId: "post-1",
        attachmentType: "carousel",
        dedupKey: "same-key",
        documentId: "requested-carousel",
        filename: "requested-carousel.pdf",
      },
      "job-1",
      progressReporter(),
    );

    expect(result).toEqual({
      success: true,
      documentId: "requested-carousel",
      reused: false,
    });
    const requested = await context.entityService.getEntity({
      entityType: "document",
      id: "requested-carousel",
    });
    expect(requested?.content).toBe(createPdfDataUrl(requestedPdf));

    const existing = await context.entityService.getEntity({
      entityType: "document",
      id: "existing-doc",
    });
    expect(existing?.content).toBe(createPdfDataUrl(pdfBuffer));
  });

  it("attaches a reused deduped document to the requested target", async () => {
    await context.entityService.createEntity({
      entity: {
        id: "existing-doc",
        entityType: "document",
        content: createPdfDataUrl(pdfBuffer),
        metadata: {
          mimeType: "application/pdf",
          filename: "existing.pdf",
          sourceEntityType: "social-post",
          sourceEntityId: "post-1",
          attachmentType: "carousel",
          dedupKey: "same-key",
        },
      },
    });
    await context.entityService.createEntity({
      entity: {
        id: "post-1",
        entityType: "social-post",
        content: `---\ntitle: Test\n---\nPost body`,
        metadata: { title: "Test" },
      },
    });

    const handler = new DocumentGenerationJobHandler(
      createSilentLogger(),
      context,
      {
        renderPdf: async (): Promise<Buffer> => {
          throw new Error("should not render");
        },
      },
    );

    const result = await handler.process(
      {
        renderUrl: "http://localhost/_media/carousel/template/post-1",
        sourceEntityType: "social-post",
        sourceEntityId: "post-1",
        attachmentType: "carousel",
        dedupKey: "same-key",
        targetEntityType: "social-post",
        targetEntityId: "post-1",
      },
      "job-1",
      progressReporter(),
    );

    expect(result).toEqual({
      success: true,
      documentId: "existing-doc",
      reused: true,
    });
    const post = await context.entityService.getEntity({
      entityType: "social-post",
      id: "post-1",
    });
    expect(post?.content).toContain("id: existing-doc");
  });

  it("replace true bypasses dedup and keeps the previous document artifact", async () => {
    await context.entityService.createEntity({
      entity: {
        id: "existing-doc",
        entityType: "document",
        content: createPdfDataUrl(pdfBuffer),
        metadata: {
          mimeType: "application/pdf",
          filename: "existing.pdf",
          sourceEntityType: "social-post",
          sourceEntityId: "post-1",
          attachmentType: "carousel",
          dedupKey: "same-key",
        },
      },
    });

    const replacementPdf = Buffer.from("%PDF-1.7\n%replacement");
    const handler = new DocumentGenerationJobHandler(
      createSilentLogger(),
      context,
      { renderPdf: async (): Promise<Buffer> => replacementPdf },
    );

    const result = await handler.process(
      {
        renderUrl: "http://localhost/_media/carousel/template/post-1",
        sourceEntityType: "social-post",
        sourceEntityId: "post-1",
        attachmentType: "carousel",
        dedupKey: "same-key",
        replace: true,
      },
      "job-1",
      progressReporter(),
    );

    expect(result.success).toBe(true);
    expect(result.reused).toBe(false);
    expect(result.documentId).not.toBe("existing-doc");

    const existing = await context.entityService.getEntity({
      entityType: "document",
      id: "existing-doc",
    });
    expect(existing?.content).toBe(createPdfDataUrl(pdfBuffer));

    const replacement = await context.entityService.getEntity({
      entityType: "document",
      id: result.documentId,
    });
    expect(replacement?.content).toBe(createPdfDataUrl(replacementPdf));
  });

  it("freezes a source-derived document attachment into a document entity", async () => {
    context.attachments.register("social-post", "carousel", {
      resolve: async () => ({
        type: "document",
        data: pdfBuffer,
        mimeType: "application/pdf",
        filename: "from-provider.pdf",
      }),
    });
    const handler = new DocumentGenerationJobHandler(
      createSilentLogger(),
      context,
      {
        renderPdf: async (): Promise<Buffer> => {
          throw new Error("should resolve attachment instead of render URL");
        },
      },
    );

    const result = await handler.process(
      {
        sourceEntityType: "social-post",
        sourceEntityId: "post-1",
        attachmentType: "carousel",
        documentId: "frozen-carousel",
      },
      "job-1",
      progressReporter(),
    );

    expect(result).toEqual({
      success: true,
      documentId: "frozen-carousel",
      reused: false,
    });

    const document = await context.entityService.getEntity({
      entityType: "document",
      id: "frozen-carousel",
    });
    expect(document?.content).toBe(createPdfDataUrl(pdfBuffer));
    expect(document?.metadata).toMatchObject({
      filename: "from-provider.pdf",
      attachmentType: "carousel",
      sourceEntityType: "social-post",
      sourceEntityId: "post-1",
    });
  });

  it("includes the source content hash in attachment-derived dedup keys", async () => {
    await context.entityService.createEntity({
      entity: {
        id: "post-1",
        entityType: "social-post",
        content: `---\ntitle: Test\n---\nPost body`,
        metadata: { title: "Test" },
      },
    });
    context.attachments.register("social-post", "carousel", {
      resolve: async () => ({
        type: "document",
        data: pdfBuffer,
        mimeType: "application/pdf",
        filename: "from-provider.pdf",
      }),
    });
    const source = await context.entityService.getEntity({
      entityType: "social-post",
      id: "post-1",
    });
    if (!source) throw new Error("source not created");

    const handler = new DocumentGenerationJobHandler(
      createSilentLogger(),
      context,
      {
        renderPdf: async (): Promise<Buffer> => {
          throw new Error("should resolve attachment instead of render URL");
        },
      },
    );

    await handler.process(
      {
        sourceEntityType: "social-post",
        sourceEntityId: "post-1",
        attachmentType: "carousel",
        documentId: "source-hash-doc",
      },
      "job-1",
      progressReporter(),
    );

    const document = await context.entityService.getEntity({
      entityType: "document",
      id: "source-hash-doc",
    });
    expect(document?.metadata["dedupKey"]).toContain(source.contentHash);
  });

  it("bounds generated document ids while keeping content-hash variants distinct", () => {
    const data = {
      sourceEntityType: "post",
      sourceEntityId: "align-the-misaligned",
      attachmentType: "printable",
    };
    const longHashA = "a".repeat(64);
    const longHashB = "b".repeat(64);

    const idA = getDocumentId(
      data,
      `printable:post:align-the-misaligned:resolved-attachment:${longHashA}`,
    );
    const idB = getDocumentId(
      data,
      `printable:post:align-the-misaligned:resolved-attachment:${longHashB}`,
    );

    expect(idA.length).toBeLessThanOrEqual(80);
    expect(idA).toMatch(/^printable-post-align-the-misaligned/);
    expect(idA).not.toContain(longHashA);
    expect(idB.length).toBeLessThanOrEqual(80);
    expect(idB).not.toBe(idA);
  });

  it("attaches the generated document to a target social post documents field", async () => {
    await context.entityService.createEntity({
      entity: {
        id: "post-1",
        entityType: "social-post",
        content: `---\ntitle: Test\nplatform: linkedin\nstatus: draft\n---\nPost body`,
        metadata: { title: "Test", platform: "linkedin", status: "draft" },
      },
    });

    const handler = new DocumentGenerationJobHandler(
      createSilentLogger(),
      context,
      { renderPdf: async (): Promise<Buffer> => pdfBuffer },
    );

    await handler.process(
      {
        renderUrl: "http://localhost/_media/carousel/template/post-1",
        sourceEntityType: "social-post",
        sourceEntityId: "post-1",
        attachmentType: "carousel",
        documentId: "carousel-pdf",
        targetEntityType: "social-post",
        targetEntityId: "post-1",
      },
      "job-1",
      progressReporter(),
    );

    const post = await context.entityService.getEntity({
      entityType: "social-post",
      id: "post-1",
    });
    expect(post?.content).toContain("documents:");
    expect(post?.content).toContain("id: carousel-pdf");
  });

  it("replace true repoints target document references for the same source attachment", async () => {
    await context.entityService.createEntity({
      entity: {
        id: "old-carousel",
        entityType: "document",
        content: createPdfDataUrl(pdfBuffer),
        metadata: {
          mimeType: "application/pdf",
          filename: "old.pdf",
          sourceEntityType: "deck",
          sourceEntityId: "deck-1",
          attachmentType: "carousel",
          dedupKey: "old-key",
        },
      },
    });
    await context.entityService.createEntity({
      entity: {
        id: "unrelated-doc",
        entityType: "document",
        content: createPdfDataUrl(pdfBuffer),
        metadata: {
          mimeType: "application/pdf",
          filename: "unrelated.pdf",
          sourceEntityType: "deck",
          sourceEntityId: "other-deck",
          attachmentType: "carousel",
        },
      },
    });
    await context.entityService.createEntity({
      entity: {
        id: "post-1",
        entityType: "social-post",
        content: `---\ntitle: Test\ndocuments:\n  - id: old-carousel\n  - id: unrelated-doc\n---\nPost body`,
        metadata: { title: "Test" },
      },
    });

    const handler = new DocumentGenerationJobHandler(
      createSilentLogger(),
      context,
      { renderPdf: async (): Promise<Buffer> => Buffer.from("%PDF-new") },
    );

    const result = await handler.process(
      {
        renderUrl: "http://localhost/_media/carousel/deck-1",
        sourceEntityType: "deck",
        sourceEntityId: "deck-1",
        attachmentType: "carousel",
        dedupKey: "old-key",
        replace: true,
        targetEntityType: "social-post",
        targetEntityId: "post-1",
      },
      "job-1",
      progressReporter(),
    );

    const post = await context.entityService.getEntity({
      entityType: "social-post",
      id: "post-1",
    });
    expect(post?.content).not.toContain("id: old-carousel");
    expect(post?.content).toContain("id: unrelated-doc");
    expect(post?.content).toContain(`id: ${result.documentId}`);
  });

  it("warns when multiple documents share a dedup key and reuses the first", async () => {
    for (const id of ["dup-a", "dup-b"]) {
      await context.entityService.createEntity({
        entity: {
          id,
          entityType: "document",
          content: createPdfDataUrl(pdfBuffer),
          metadata: {
            mimeType: "application/pdf",
            filename: `${id}.pdf`,
            dedupKey: "shared-key",
          },
        },
      });
    }

    const logger = createMockLogger();
    const handler = new DocumentGenerationJobHandler(logger, context, {
      renderPdf: async (): Promise<Buffer> => {
        throw new Error("should not render");
      },
    });

    const result = await handler.process(
      {
        renderUrl: "http://localhost/_media/carousel/template/post-1",
        sourceEntityType: "social-post",
        sourceEntityId: "post-1",
        attachmentType: "carousel",
        dedupKey: "shared-key",
      },
      "job-1",
      progressReporter(),
    );

    expect(result).toMatchObject({ success: true, reused: true });
    expect(logger.warn).toHaveBeenCalled();
  });

  it("rejects jobs exceeding the max page count before rendering", async () => {
    const handler = new DocumentGenerationJobHandler(
      createSilentLogger(),
      context,
      {
        renderPdf: async (): Promise<Buffer> => {
          throw new Error("should not render");
        },
      },
    );

    try {
      await handler.process(
        {
          renderUrl: "http://localhost/_media/carousel/template/post-1",
          sourceEntityType: "social-post",
          sourceEntityId: "post-1",
          attachmentType: "carousel",
          pageCount: 21,
          maxPageCount: 20,
        },
        "job-1",
        progressReporter(),
      );
      throw new Error("Expected handler to reject");
    } catch (error) {
      expectErrorMessage(error, "Refusing to render 21 page PDF");
    }
  });

  it("rejects rendered PDFs that exceed the max page count even when pageCount is not declared", async () => {
    const oversizedPdf = Buffer.from(
      `%PDF-1.7\n${"\n/Type /Pages /Count 30\n".repeat(1)}%%EOF`,
    );
    const handler = new DocumentGenerationJobHandler(
      createSilentLogger(),
      context,
      { renderPdf: async (): Promise<Buffer> => oversizedPdf },
    );

    try {
      await handler.process(
        {
          renderUrl: "http://localhost/_media/carousel/template/post-1",
          sourceEntityType: "social-post",
          sourceEntityId: "post-1",
          attachmentType: "carousel",
          maxPageCount: 20,
        },
        "job-1",
        progressReporter(),
      );
      throw new Error("Expected handler to reject");
    } catch (error) {
      expectErrorMessage(error, "Rendered PDF has 30 pages");
    }

    const stored = await context.entityService.listEntities({
      entityType: "document",
    });
    expect(stored).toHaveLength(0);
  });
});
