import { beforeEach, describe, expect, it, mock } from "bun:test";
import { createPluginHarness } from "@brains/plugins/test";
import { AttachmentRegistry } from "@brains/plugins";
import { DecksPlugin, type DecksPluginDeps } from "../../src/plugin";
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
