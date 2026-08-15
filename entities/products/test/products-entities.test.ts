import { describe, it, expect } from "bun:test";
import { createSilentLogger } from "@brains/test-utils";
import { createPluginHarness } from "@brains/plugins/test";
import {
  bindPluginPackageMetadata,
  instantiatePluginPackageDefinition,
} from "@brains/plugins";
import productsPackage, { product, productsOverview } from "../src";
import { productMetadataSchema } from "../src/schemas/product";

const PACKAGE_METADATA = { name: "@brains/products", version: "0.0.0-test" };

const productCodec = product.markdown;
if (!productCodec) throw new Error("Product declares no markdown codec");
const overviewCodec = productsOverview.markdown;
if (!overviewCodec) throw new Error("Overview declares no markdown codec");

const productFrontmatter = {
  name: "Rover",
  availability: "early access" as const,
  order: 1,
  ogImageId: "image-1",
};

describe("products entities", () => {
  it("decodes product frontmatter and slugifies the name", () => {
    const decoded = productCodec.decode({
      content: "## Tagline\n\nA hub",
      frontmatter: productFrontmatter,
    });

    expect(decoded.metadata).toEqual({
      name: "Rover",
      availability: "early access",
      order: 1,
      ogImageId: "image-1",
      slug: "rover",
    });
  });

  it("slugifies multi-word names", () => {
    const decoded = productCodec.decode({
      content: "## Tagline\n\nA hub",
      frontmatter: { ...productFrontmatter, name: "My Cool Brain" },
    });

    expect(decoded.metadata.slug).toBe("my-cool-brain");
  });

  it("round-trips ogImageId, which arrives only in frontmatter", () => {
    // The class-based adapter re-read frontmatter off the stored content
    // when encoding. A declarative codec encodes from metadata alone, so
    // ogImageId has to be carried there.
    const decoded = productCodec.decode({
      content: "## Tagline\n\nA hub",
      frontmatter: productFrontmatter,
    });
    const encoded = productCodec.encode({
      content: decoded.content,
      metadata: productMetadataSchema.parse(decoded.metadata),
    });

    expect(encoded.frontmatter).toEqual({
      name: "Rover",
      availability: "early access",
      order: 1,
      ogImageId: "image-1",
    });
  });

  it("omits ogImageId when the source frontmatter has none", () => {
    const decoded = productCodec.decode({
      content: "## Tagline\n\nA hub",
      frontmatter: {
        name: "Rover",
        availability: "early access",
        order: 1,
      },
    });

    expect(decoded.metadata).not.toHaveProperty("ogImageId");
  });

  it("decodes the overview singleton", () => {
    const decoded = overviewCodec.decode({
      content: "## Vision\n\nA better brain",
      frontmatter: { headline: "Rizom Brains", tagline: "Think together" },
    });

    expect(decoded.metadata).toEqual({
      headline: "Rizom Brains",
      slug: "rizom-brains",
    });
  });

  it("registers both entity types, its templates, and its data source", async () => {
    bindPluginPackageMetadata(productsPackage, PACKAGE_METADATA);
    const plugins = instantiatePluginPackageDefinition(
      productsPackage,
      {},
      PACKAGE_METADATA,
    );
    expect(plugins.map(({ id }) => id)).toEqual([
      "@brains/products:product",
      "@brains/products:products-overview",
    ]);

    const harness = createPluginHarness({
      logger: createSilentLogger("products-entities-test"),
    });
    for (const plugin of plugins) await harness.installPlugin(plugin);

    expect(harness.getEntityService().getEntityTypes()).toEqual([
      "product",
      "products-overview",
    ]);
    expect([...harness.getTemplates().keys()]).toContain(
      "@brains/products:product:product-list",
    );
    expect([...harness.getDataSources().keys()]).toContain(
      "@brains/products:entities",
    );

    harness.reset();
  });
});
