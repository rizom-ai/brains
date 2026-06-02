import { beforeEach, describe, expect, it, mock } from "bun:test";
import { createPluginHarness } from "@brains/plugins/test";
import { AttachmentRegistry } from "@brains/plugins";
import { ProductsPlugin } from "../../src/plugin";
import { ProductPrintableAttachmentProvider } from "../../src/attachments/printable-provider";
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

## Role

Operator-facing brain model.

## Purpose

Help teams publish and maintain content.

## Audience

Small teams and solo operators.

## Values

- durable
- useful

## Capabilities

### Draft generation

Creates structured drafts.

## Story

Rover helps operators keep momentum.
`,
  metadata: {
    name: "Rover",
    slug: "rover",
    availability: "available",
    order: 1,
  },
};

describe("Product printable attachment provider", () => {
  beforeEach(() => {
    AttachmentRegistry.resetInstance();
  });

  it("registers a product printable attachment provider", async () => {
    const harness = createPluginHarness<ProductsPlugin>();
    await harness.installPlugin(new ProductsPlugin());

    const context = harness.getEntityContext("test");
    expect(context.attachments.hasProvider("product", "printable")).toBe(true);
  });

  it("resolves a product into a printable PDF attachment", async () => {
    const renderPdf = mock(async (url: string) => {
      expect(url).toContain("/_media/printable/product/product-1/");
      const html = await (await fetch(url)).text();
      expect(html).toContain("Rover");
      expect(html).toContain("working memory layer");
      return Buffer.from("%PDF-product-printable");
    });
    const harness = createPluginHarness<ProductsPlugin>();
    await harness.installPlugin(new ProductsPlugin());
    await harness.getEntityService().createEntity({ entity: sampleProduct });

    const provider = new ProductPrintableAttachmentProvider(
      {
        entityService: harness.getEntityService(),
        themeCSS: "",
        identity: harness.getEntityContext("test").identity,
        domain: "example.com",
      },
      { renderPdf },
    );

    const attachment = await provider.resolve({
      sourceEntityType: "product",
      sourceEntityId: "product-1",
      attachmentType: "printable",
    });

    expect(renderPdf).toHaveBeenCalled();
    expect(attachment).toEqual({
      type: "document",
      data: Buffer.from("%PDF-product-printable"),
      mimeType: "application/pdf",
      filename: "rover-printable.pdf",
    });
  });
});
