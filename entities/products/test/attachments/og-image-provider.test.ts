import { beforeEach, describe, expect, it, mock } from "bun:test";
import { createPluginHarness } from "@brains/plugins/test";
import {
  bindPluginPackageMetadata,
  instantiatePluginPackageDefinition,
} from "@brains/plugins";
import productsPackage from "../../src";

const PACKAGE_METADATA = { name: "@brains/products", version: "0.0.0-test" };

function productPlugin(): Parameters<
  ReturnType<typeof createPluginHarness>["installPlugin"]
>[0] {
  bindPluginPackageMetadata(productsPackage, PACKAGE_METADATA);
  const plugin = instantiatePluginPackageDefinition(
    productsPackage,
    {},
    PACKAGE_METADATA,
  )[0];
  if (!plugin) throw new Error("Product entity plugin was not created");
  return plugin;
}
import { createProductOgImageProvider } from "../../src/attachments/og-image-provider";
import type { Product } from "../../src/schemas/product";

const sampleProduct: Product = {
  id: "product-1",
  entityType: "product",
  visibility: "public",
  contentHash: "product-hash",
  created: "2024-01-01T00:00:00Z",
  updated: "2024-01-01T00:00:00Z",
  content: `---
name: Rover
availability: available
order: 1
---
## Tagline

A working memory layer for publishing teams.

## Promise

Rover turns scattered work into durable knowledge.
`,
  metadata: {
    name: "Rover",
    slug: "rover",
    availability: "available",
    order: 1,
  },
};

const TINY_PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

describe("Product OG image attachment provider", () => {
  beforeEach(() => {});

  it("registers a product OG image attachment provider", async () => {
    const harness = createPluginHarness();
    await harness.installPlugin(productPlugin());

    const context = harness.getEntityContext("test");
    expect(context.attachments.hasProvider("product", "og-image")).toBe(true);
  });

  it("resolves a product into a PNG OG image attachment", async () => {
    const screenshotPng = mock(async (url: string, viewport) => {
      expect(url).toContain("/_media/og/product/product-1/");
      expect(viewport).toEqual({ width: 1200, height: 630 });
      const html = await (await fetch(url)).text();
      expect(html).toContain("Rover");
      expect(html).toContain("working memory layer");
      return TINY_PNG;
    });
    const harness = createPluginHarness();
    await harness.installPlugin(productPlugin());
    await harness.getEntityService().createEntity({ entity: sampleProduct });

    const provider = createProductOgImageProvider(
      {
        entityService: harness.getEntityService(),
        themeCSS: "",
        identity: harness.getEntityContext("test").identity,
        domain: "example.com",
      },
      { screenshotPng },
    );

    const attachment = await provider.resolve({
      sourceEntityType: "product",
      sourceEntityId: "product-1",
      attachmentType: "og-image",
    });

    expect(screenshotPng).toHaveBeenCalled();
    expect(attachment).toEqual({
      type: "image",
      data: TINY_PNG,
      mimeType: "image/png",
      filename: "rover-og.png",
    });
  });
});
