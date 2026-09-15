import { describe, expect, it, spyOn } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createPluginHarness } from "@brains/plugins/test";
import { DecksPlugin } from "../../src/plugin";
import { createDeckOgImageProvider } from "../../src/attachments/og-image-provider";
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

const unexpected = async (): Promise<never> => {
  throw new Error("Unexpected file operation");
};

describe("Deck OG image attachment provider", () => {
  it("registers a deck OG image attachment provider", async () => {
    const harness = createPluginHarness<DecksPlugin>();
    await harness.installPlugin(new DecksPlugin());

    const context = harness.getEntityContext("test");
    expect(context.attachments.hasProvider("deck", "og-image")).toBe(true);
  });

  it("resolves a deck into a PNG OG image attachment", async () => {
    const harness = createPluginHarness<DecksPlugin>();
    await harness.installPlugin(new DecksPlugin());
    await harness.getEntityService().createEntity({ entity: sampleDeck });

    const service = harness.getEntityService();
    service.fileAssets = {
      inspect: unexpected,
      publish: unexpected,
      download: unexpected,
      fingerprint: unexpected,
      close: async (): Promise<void> => undefined,
      withProducedFile: async (
        directory,
        use,
        options,
      ): ReturnType<typeof use> => {
        const html = await readFile(join(directory, "index.html"), "utf8");
        expect(html).toContain("Distributed Systems Primer");
        expect(html).toContain("2 slides");
        expect(html).toContain("Architecture Week");
        return use(
          {
            sourceFile: join(directory, "rendered.png"),
            sizeBytes: 8,
            sha256: "a".repeat(64),
          },
          options?.signal ?? new AbortController().signal,
        );
      },
    };
    spyOn(service.fileAssets, "withProducedFile");
    const provider = createDeckOgImageProvider({
      entityService: harness.getEntityService(),
      themeCSS: "",
      identity: harness.getEntityContext("test").identity,
      domain: "example.com",
    });

    const attachment = await provider.withFile(
      {
        sourceEntityType: "deck",
        sourceEntityId: "deck-1",
        attachmentType: "og-image",
      },
      async (file) => file,
    );

    expect(service.fileAssets.withProducedFile).toHaveBeenCalled();
    expect(attachment).toEqual({
      type: "image",
      source: { sourceFile: expect.any(String), sizeBytes: 8 },
      sha256: "a".repeat(64),
      mimeType: "image/png",
      filename: "distributed-systems-primer-og.png",
    });
  });
});
