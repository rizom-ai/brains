import { beforeEach, describe, expect, it } from "bun:test";
import { ProgressReporter, z } from "@brains/utils";
import {
  createMockShell,
  createServicePluginContext,
  type ServicePluginContext,
} from "@brains/plugins/test";
import { createSilentLogger } from "@brains/test-utils";
import {
  documentAdapter,
  documentSchema,
  createPdfDataUrl,
} from "@brains/document";
import { MediaDocumentGenerationJobHandler } from "../../src/handlers/mediaDocumentGenerationHandler";

const pdfBuffer = Buffer.from("%PDF-1.7\n%carousel");

function progressReporter(): ProgressReporter {
  const reporter = ProgressReporter.from(async () => undefined);
  if (!reporter) throw new Error("Failed to create progress reporter");
  return reporter;
}

describe("MediaDocumentGenerationJobHandler", () => {
  let context: ServicePluginContext;

  beforeEach((): void => {
    const shell = createMockShell({ logger: createSilentLogger() });
    shell
      .getEntityRegistry()
      .registerEntityType("document", documentSchema, documentAdapter);
    shell
      .getEntityRegistry()
      .registerEntityType("social-post", z.any(), {} as never);
    context = createServicePluginContext(shell, "site-builder");
  });

  it("renders and stores a generated PDF document", async () => {
    const handler = new MediaDocumentGenerationJobHandler(
      createSilentLogger(),
      context,
      { renderPdf: async (): Promise<Buffer> => pdfBuffer },
    );

    const result = await handler.process(
      {
        renderUrl: "http://localhost/_media/carousel/template/post-1",
        sourceEntityType: "social-post",
        sourceEntityId: "post-1",
        sourceTemplate: "carousel-template",
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
      sourceTemplate: "carousel-template",
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

    const handler = new MediaDocumentGenerationJobHandler(
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
        sourceTemplate: "carousel-template",
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

  it("attaches the generated document to a target social post documents field", async () => {
    await context.entityService.createEntity({
      entity: {
        id: "post-1",
        entityType: "social-post",
        content: `---\ntitle: Test\nplatform: linkedin\nstatus: draft\n---\nPost body`,
        metadata: { title: "Test", platform: "linkedin", status: "draft" },
      },
    });

    const handler = new MediaDocumentGenerationJobHandler(
      createSilentLogger(),
      context,
      { renderPdf: async (): Promise<Buffer> => pdfBuffer },
    );

    await handler.process(
      {
        renderUrl: "http://localhost/_media/carousel/template/post-1",
        sourceEntityType: "social-post",
        sourceEntityId: "post-1",
        sourceTemplate: "carousel-template",
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

  it("rejects jobs exceeding the max page count before rendering", async () => {
    const handler = new MediaDocumentGenerationJobHandler(
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
          sourceTemplate: "carousel-template",
          pageCount: 21,
          maxPageCount: 20,
        },
        "job-1",
        progressReporter(),
      );
      throw new Error("Expected handler to reject");
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toContain(
        "Refusing to render 21 page PDF",
      );
    }
  });
});
