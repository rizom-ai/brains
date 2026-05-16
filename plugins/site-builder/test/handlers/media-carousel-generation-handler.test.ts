import { beforeEach, describe, expect, it } from "bun:test";
import {
  BaseEntityAdapter,
  baseEntitySchema,
  createMockShell,
  createServicePluginContext,
  type ServicePluginContext,
} from "@brains/plugins/test";
import { ProgressReporter, z } from "@brains/utils";
import { createSilentLogger } from "@brains/test-utils";
import { documentAdapter, documentSchema } from "@brains/document";
import { MediaCarouselGenerationJobHandler } from "../../src/handlers/mediaCarouselGenerationHandler";

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
    return { entityType: "social-post", content };
  }
}

const deckStubSchema = baseEntitySchema.extend({
  entityType: z.literal("deck"),
});
type DeckStub = z.infer<typeof deckStubSchema>;

class DeckStubAdapter extends BaseEntityAdapter<DeckStub> {
  constructor() {
    super({
      entityType: "deck",
      schema: deckStubSchema,
      frontmatterSchema: z.object({}),
    });
  }

  public fromMarkdown(content: string): Partial<DeckStub> {
    return { entityType: "deck", content };
  }
}

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

describe("MediaCarouselGenerationJobHandler", () => {
  let context: ServicePluginContext;
  let renderUrls: string[];

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
    shell
      .getEntityRegistry()
      .registerEntityType("deck", deckStubSchema, new DeckStubAdapter());
    context = createServicePluginContext(shell, "site-builder");
    renderUrls = [];
  });

  it("renders a deck-backed social post into a PDF document attachment", async () => {
    await context.entityService.createEntity({
      entity: {
        id: "post-1",
        entityType: "social-post",
        content: `---\ntitle: LinkedIn Carousel\nplatform: linkedin\nstatus: draft\nsourceEntityType: deck\nsourceEntityId: deck-1\n---\nPost copy`,
        metadata: {
          title: "LinkedIn Carousel",
          platform: "linkedin",
          status: "draft",
        },
      },
    });
    await context.entityService.createEntity({
      entity: {
        id: "deck-1",
        entityType: "deck",
        content: `---\ntitle: Source Deck\nstatus: draft\n---\n# Slide one\n\nHello\n\n---\n\n## Slide two\n\nWorld`,
        metadata: {
          title: "Source Deck",
          status: "draft",
          slug: "source-deck",
        },
      },
    });

    const handler = new MediaCarouselGenerationJobHandler(
      createSilentLogger(),
      context,
      {
        renderPdf: async (url: string): Promise<Buffer> => {
          renderUrls.push(url);
          return Buffer.from("%PDF-1.7\n/Type /Pages /Count 2\n%%EOF");
        },
      },
    );

    const result = await handler.process(
      { socialPostId: "post-1", maxPageCount: 5 },
      "job-1",
      progressReporter(),
    );

    expect(result).toEqual({
      success: true,
      documentId: "post-1-carousel",
      slideCount: 2,
    });
    expect(renderUrls).toHaveLength(1);
    expect(renderUrls[0]).toContain("/_media/carousel/post-1/");

    const document = await context.entityService.getEntity({
      entityType: "document",
      id: "post-1-carousel",
    });
    expect(document?.metadata).toMatchObject({
      filename: "post-1-carousel.pdf",
      pageCount: 2,
      sourceEntityType: "deck",
      sourceEntityId: "deck-1",
      sourceTemplate: "site-builder:linkedin-carousel",
    });

    const socialPost = await context.entityService.getEntity({
      entityType: "social-post",
      id: "post-1",
    });
    expect(socialPost?.content).toContain("documents:");
    expect(socialPost?.content).toContain("id: post-1-carousel");
  });

  it("rejects social posts that do not point at a deck", async () => {
    await context.entityService.createEntity({
      entity: {
        id: "post-1",
        entityType: "social-post",
        content: `---\ntitle: Text Post\nplatform: linkedin\nstatus: draft\nsourceEntityType: post\nsourceEntityId: blog-1\n---\nPost copy`,
        metadata: { title: "Text Post", platform: "linkedin", status: "draft" },
      },
    });

    const handler = new MediaCarouselGenerationJobHandler(
      createSilentLogger(),
      context,
      { renderPdf: async (): Promise<Buffer> => Buffer.from("%PDF-1.7") },
    );

    try {
      await handler.process(
        { socialPostId: "post-1" },
        "job-1",
        progressReporter(),
      );
      throw new Error("Expected handler to reject");
    } catch (error) {
      expectErrorMessage(error, "must reference a deck source");
    }
  });
});
