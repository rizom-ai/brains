import { beforeEach, describe, expect, it } from "bun:test";
import { ProgressReporter, z } from "@brains/utils";
import {
  BaseEntityAdapter,
  baseEntitySchema,
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

const socialPostStubSchema = baseEntitySchema.extend({
  entityType: z.literal("social-post"),
});
type SocialPostStub = z.infer<typeof socialPostStubSchema>;

class SocialPostStubAdapter extends BaseEntityAdapter<SocialPostStub> {
  constructor() {
    super({
      entityType: "social-post",
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

describe("MediaDocumentGenerationJobHandler", () => {
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
      expectErrorMessage(error, "Refusing to render 21 page PDF");
    }
  });

  it("rejects rendered PDFs that exceed the max page count even when pageCount is not declared", async () => {
    const oversizedPdf = Buffer.from(
      `%PDF-1.7\n${"\n/Type /Pages /Count 30\n".repeat(1)}%%EOF`,
    );
    const handler = new MediaDocumentGenerationJobHandler(
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
          sourceTemplate: "carousel-template",
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
