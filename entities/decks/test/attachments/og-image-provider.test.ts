import { beforeEach, describe, expect, it, mock } from "bun:test";
import { createPluginHarness } from "@brains/plugins/test";
import { AttachmentRegistry } from "@brains/plugins";
import { DecksPlugin } from "../../src/plugin";
import { DeckOgImageAttachmentProvider } from "../../src/attachments/og-image-provider";
import type { DeckEntity } from "../../src/schemas/deck";

const sampleDeck: DeckEntity = {
  id: "deck-1",
  entityType: "deck",
  visibility: "public",
  content: `---
title: Distributed Systems Primer
status: published
slug: distributed-systems-primer
description: A practical introduction to distributed systems failure modes.
publishedAt: "2025-09-10T00:00:00.000Z"
event: Architecture Week
---
# Distributed Systems Primer

What every developer should know.

---

## Failure Modes

Networks fail in surprising ways.
`,
  contentHash: "deck-hash",
  created: "2024-01-01T00:00:00Z",
  updated: "2024-01-01T00:00:00Z",
  metadata: {
    title: "Distributed Systems Primer",
    slug: "distributed-systems-primer",
    description:
      "A practical introduction to distributed systems failure modes.",
    status: "published",
    publishedAt: "2025-09-10T00:00:00.000Z",
  },
};

const TINY_PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

describe("Deck OG image attachment provider", () => {
  beforeEach(() => {
    AttachmentRegistry.resetInstance();
  });

  it("registers a deck OG image attachment provider", async () => {
    const harness = createPluginHarness<DecksPlugin>();
    await harness.installPlugin(new DecksPlugin());

    const context = harness.getEntityContext("test");
    expect(context.attachments.hasProvider("deck", "og-image")).toBe(true);
  });

  it("resolves a deck into a PNG OG image attachment", async () => {
    const screenshotPng = mock(async (url: string, viewport) => {
      expect(url).toContain("/_media/og/deck/deck-1/");
      expect(viewport).toEqual({ width: 1200, height: 630 });
      const html = await (await fetch(url)).text();
      expect(html).toContain("Distributed Systems Primer");
      expect(html).toContain("2 slides");
      expect(html).toContain("Architecture Week");
      return TINY_PNG;
    });
    const harness = createPluginHarness<DecksPlugin>();
    await harness.installPlugin(new DecksPlugin());
    await harness.getEntityService().createEntity({ entity: sampleDeck });

    const provider = new DeckOgImageAttachmentProvider(
      {
        entityService: harness.getEntityService(),
        themeCSS: "",
        identity: harness.getEntityContext("test").identity,
        domain: "example.com",
      },
      { screenshotPng },
    );

    const attachment = await provider.resolve({
      sourceEntityType: "deck",
      sourceEntityId: "deck-1",
      attachmentType: "og-image",
    });

    expect(screenshotPng).toHaveBeenCalled();
    expect(attachment).toEqual({
      type: "image",
      data: TINY_PNG,
      mimeType: "image/png",
      filename: "distributed-systems-primer-og.png",
    });
  });
});
