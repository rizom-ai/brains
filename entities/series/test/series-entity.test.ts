import { beforeEach, describe, it, expect } from "bun:test";
import { createSilentLogger } from "@brains/test-utils";
import { createPluginHarness } from "@brains/plugins/test";
import {
  bindPluginPackageMetadata,
  instantiatePluginPackageDefinition,
} from "@brains/plugins";
import { AtprotoProjectionRegistry } from "@brains/atproto-contracts";
import seriesPackage, { series } from "../src";
import { seriesMetadataSchema } from "../src/schemas/series";

const PACKAGE_METADATA = { name: "@brains/series", version: "0.0.0-test" };

const codec = series.markdown;
if (!codec) throw new Error("Series declares no markdown codec");

const frontmatter = {
  title: "Building Brains",
  slug: "building-brains",
  coverImageId: "image-1",
};

async function install(): Promise<ReturnType<typeof createPluginHarness>> {
  bindPluginPackageMetadata(seriesPackage, PACKAGE_METADATA);
  const plugin = instantiatePluginPackageDefinition(
    seriesPackage,
    {},
    PACKAGE_METADATA,
  )[0];
  if (!plugin) throw new Error("Series entity plugin was not created");
  const harness = createPluginHarness({
    logger: createSilentLogger("series-entity-test"),
  });
  await harness.installPlugin(plugin);
  return harness;
}

describe("series entity", () => {
  // The projection registry is a singleton and stacks registrations, so a
  // test that asserts teardown needs a clean one.
  beforeEach(() => {
    AtprotoProjectionRegistry.resetInstance();
  });

  it("decodes frontmatter into metadata", () => {
    expect(
      codec.decode({ content: "## Description\n\nA series", frontmatter })
        .metadata,
    ).toEqual({
      title: "Building Brains",
      slug: "building-brains",
      coverImageId: "image-1",
    });
  });

  it("round-trips coverImageId, which arrives only in frontmatter", () => {
    const decoded = codec.decode({
      content: "## Description\n\nA series",
      frontmatter,
    });
    const encoded = codec.encode({
      content: decoded.content,
      metadata: seriesMetadataSchema.parse(decoded.metadata),
    });

    expect(encoded.frontmatter).toEqual({
      title: "Building Brains",
      slug: "building-brains",
      coverImageId: "image-1",
    });
  });

  it("weights a series below the content it indexes", () => {
    expect(series.config).toMatchObject({
      weight: 0.5,
      projectionSourceRole: "supporting",
    });
  });

  it("registers the entity type, templates, and its data source", async () => {
    const harness = await install();

    expect(harness.getEntityService().getEntityTypes()).toContain("series");

    const templateNames = [...harness.getTemplates().keys()];
    for (const name of ["series-list", "series-detail", "description"]) {
      expect(templateNames.some((template) => template.includes(name))).toBe(
        true,
      );
    }
    expect([...harness.getDataSources().keys()]).toContain(
      "@brains/series:entities",
    );

    harness.reset();
  });

  it("registers one scheduler-owned projection rule", async () => {
    bindPluginPackageMetadata(seriesPackage, PACKAGE_METADATA);
    const plugin = instantiatePluginPackageDefinition(
      seriesPackage,
      {},
      PACKAGE_METADATA,
    )[0];
    if (!plugin) throw new Error("Series entity plugin was not created");
    const harness = createPluginHarness({
      logger: createSilentLogger("series-projection-rule-test"),
    });

    const capabilities = await harness.installPlugin(plugin);

    expect("projections" in capabilities).toBe(false);
    expect(capabilities.projectionRules).toHaveLength(1);
    expect(capabilities.projectionRules?.[0]).toMatchObject({
      targetType: "series",
    });
    expect(capabilities.tools).toHaveLength(0);

    harness.reset();
  });

  it("registers its atproto projection and releases it on shutdown", async () => {
    bindPluginPackageMetadata(seriesPackage, PACKAGE_METADATA);
    const plugin = instantiatePluginPackageDefinition(
      seriesPackage,
      {},
      PACKAGE_METADATA,
    )[0];
    if (!plugin) throw new Error("Series entity plugin was not created");
    const harness = createPluginHarness({
      logger: createSilentLogger("series-atproto-test"),
    });
    await harness.installPlugin(plugin);

    expect(
      AtprotoProjectionRegistry.getInstance().get("series")?.collection,
    ).toBe("ai.rizom.brain.series");

    await plugin.shutdown?.();
    expect(
      AtprotoProjectionRegistry.getInstance().get("series"),
    ).toBeUndefined();

    harness.reset();
  });
});
