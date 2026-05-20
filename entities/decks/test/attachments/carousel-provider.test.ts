import { beforeEach, describe, expect, it, mock } from "bun:test";
import { createPluginHarness } from "@brains/plugins/test";
import { AttachmentRegistry } from "@brains/plugins";
import { DecksPlugin, type DecksPluginDeps } from "../../src/plugin";
import { DeckCarouselAttachmentProvider } from "../../src/attachments/carousel-provider";
import type { DeckEntity } from "../../src/schemas/deck";

const sampleDeck: DeckEntity = {
  id: "deck-1",
  entityType: "deck",
  content: `---
title: Test Deck
status: draft
slug: test-deck
---
# Slide 1

---

# Slide 2`,
  contentHash: "deck-hash",
  created: "2024-01-01T00:00:00Z",
  updated: "2024-01-01T00:00:00Z",
  metadata: {
    title: "Test Deck",
    slug: "test-deck",
    status: "draft",
  },
};

describe("Deck carousel attachment provider", () => {
  beforeEach(() => {
    AttachmentRegistry.resetInstance();
  });

  it("registers a deck carousel attachment provider", async () => {
    const harness = createPluginHarness<DecksPlugin>();
    const deps: DecksPluginDeps = {
      renderPdf: async () => Buffer.from("%PDF-carousel"),
    };

    await harness.installPlugin(new DecksPlugin(deps));

    const context = harness.getEntityContext("test");
    expect(context.attachments.hasProvider("deck", "carousel")).toBe(true);
  });

  it("refuses to render decks that exceed the max slide count", async () => {
    const renderPdf = mock(async () => Buffer.from("%PDF"));
    const harness = createPluginHarness<DecksPlugin>();
    const deps: DecksPluginDeps = { renderPdf };

    await harness.installPlugin(new DecksPlugin(deps));
    const slides = Array.from(
      { length: 21 },
      (_, i) => `# Slide ${i + 1}`,
    ).join("\n\n---\n\n");
    await harness.getEntityService().createEntity({
      entity: {
        ...sampleDeck,
        id: "deck-oversized",
        content: `---\ntitle: Oversized\nstatus: draft\nslug: oversized\n---\n${slides}`,
      },
    });

    try {
      await harness.getEntityContext("test").attachments.resolve({
        sourceEntityType: "deck",
        sourceEntityId: "deck-oversized",
        attachmentType: "carousel",
      });
      throw new Error("Expected carousel resolution to reject");
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      if (error instanceof Error) {
        expect(error.message).toContain("21 slides");
      }
    }
    expect(renderPdf).not.toHaveBeenCalled();
  });

  it("passes active theme CSS through to the media render page", async () => {
    const harness = createPluginHarness<DecksPlugin>();
    await harness.installPlugin(new DecksPlugin());
    await harness.getEntityService().createEntity({ entity: sampleDeck });

    const provider = new DeckCarouselAttachmentProvider(
      {
        entityService: harness.getEntityService(),
        themeCSS: ":root { --carousel-test-token: #123456; }",
        identity: harness.getEntityContext("test").identity,
      },
      {
        renderPdf: async (url: string): Promise<Buffer> => {
          const stylesUrl = new URL("/styles/main.css", url).toString();
          const response = await fetch(stylesUrl);
          expect(response.status).toBe(200);
          expect(await response.text()).toContain("--carousel-test-token");
          return Buffer.from("%PDF-themed-carousel");
        },
      },
    );

    const attachment = await provider.resolve({
      sourceEntityType: "deck",
      sourceEntityId: "deck-1",
      attachmentType: "carousel",
    });

    expect(attachment).toEqual({
      type: "document",
      data: Buffer.from("%PDF-themed-carousel"),
      mimeType: "application/pdf",
      filename: "test-deck-carousel.pdf",
    });
  });

  it("uses the brain identity name as the carousel brand wordmark", async () => {
    const harness = createPluginHarness<DecksPlugin>();
    await harness.installPlugin(new DecksPlugin());
    await harness.getEntityService().createEntity({ entity: sampleDeck });

    let renderedHtml = "";
    const provider = new DeckCarouselAttachmentProvider(
      {
        entityService: harness.getEntityService(),
        themeCSS: "",
        identity: harness.getEntityContext("test").identity,
      },
      {
        renderPdf: async (url: string): Promise<Buffer> => {
          renderedHtml = await (await fetch(url)).text();
          return Buffer.from("%PDF-brand");
        },
      },
    );

    await provider.resolve({
      sourceEntityType: "deck",
      sourceEntityId: "deck-1",
      attachmentType: "carousel",
    });

    // Harness mock returns name: "Test Owner" — should land in the wordmark.
    const wordmark = renderedHtml.match(
      /<span class="deck-carousel-wordmark">([^<]+)<\/span>/,
    );
    expect(wordmark?.[1]).toBe("Test Owner");
  });

  it("reads themeMode from the site-info entity by default", async () => {
    const harness = createPluginHarness<DecksPlugin>();

    let renderedHtml = "";
    await harness.installPlugin(
      new DecksPlugin({
        renderPdf: async (url: string): Promise<Buffer> => {
          renderedHtml = await (await fetch(url)).text();
          return Buffer.from("%PDF-site-info");
        },
      }),
    );

    await harness.getEntityService().createEntity({ entity: sampleDeck });
    await harness.getEntityService().createEntity({
      entity: {
        id: "site-info",
        entityType: "site-info",
        content: `---
title: Test Site
description: Test
themeMode: light
---`,
        created: "2024-01-01T00:00:00Z",
        updated: "2024-01-01T00:00:00Z",
        metadata: {},
      },
    });

    await harness.getEntityContext("test").attachments.resolve({
      sourceEntityType: "deck",
      sourceEntityId: "deck-1",
      attachmentType: "carousel",
    });

    expect(renderedHtml).toContain('data-theme="light"');
  });

  it("passes themeMode from getThemeMode dep through to the rendered page", async () => {
    const harness = createPluginHarness<DecksPlugin>();
    await harness.installPlugin(new DecksPlugin());
    await harness.getEntityService().createEntity({ entity: sampleDeck });

    let renderedHtml = "";
    const provider = new DeckCarouselAttachmentProvider(
      {
        entityService: harness.getEntityService(),
        themeCSS: "",
        identity: harness.getEntityContext("test").identity,
      },
      {
        renderPdf: async (url: string): Promise<Buffer> => {
          renderedHtml = await (await fetch(url)).text();
          return Buffer.from("%PDF-light");
        },
        getThemeMode: async () => "light",
      },
    );

    await provider.resolve({
      sourceEntityType: "deck",
      sourceEntityId: "deck-1",
      attachmentType: "carousel",
    });

    expect(renderedHtml).toContain('data-theme="light"');
  });

  it("defaults to dark mode when getThemeMode is not provided", async () => {
    const harness = createPluginHarness<DecksPlugin>();
    await harness.installPlugin(new DecksPlugin());
    await harness.getEntityService().createEntity({ entity: sampleDeck });

    let renderedHtml = "";
    const provider = new DeckCarouselAttachmentProvider(
      {
        entityService: harness.getEntityService(),
        themeCSS: "",
        identity: harness.getEntityContext("test").identity,
      },
      {
        renderPdf: async (url: string): Promise<Buffer> => {
          renderedHtml = await (await fetch(url)).text();
          return Buffer.from("%PDF-dark");
        },
      },
    );

    await provider.resolve({
      sourceEntityType: "deck",
      sourceEntityId: "deck-1",
      attachmentType: "carousel",
    });

    expect(renderedHtml).toContain('data-theme="dark"');
  });

  it("resolves a deck into a PDF carousel attachment", async () => {
    const renderPdf = mock(async (url: string) => {
      expect(url).toContain("/_media/carousel/deck-1/");
      return Buffer.from("%PDF-carousel");
    });
    const harness = createPluginHarness<DecksPlugin>();
    const deps: DecksPluginDeps = { renderPdf };

    await harness.installPlugin(new DecksPlugin(deps));
    await harness.getEntityService().createEntity({ entity: sampleDeck });

    const attachment = await harness
      .getEntityContext("test")
      .attachments.resolve({
        sourceEntityType: "deck",
        sourceEntityId: "deck-1",
        attachmentType: "carousel",
      });

    expect(renderPdf).toHaveBeenCalled();
    expect(attachment).toEqual({
      type: "document",
      data: Buffer.from("%PDF-carousel"),
      mimeType: "application/pdf",
      filename: "test-deck-carousel.pdf",
    });
  });
});
