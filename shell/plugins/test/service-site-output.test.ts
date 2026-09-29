import { afterEach, describe, expect, it } from "bun:test";
import { createSilentLogger } from "@brains/test-utils";
import { z } from "@brains/utils/zod";
import {
  defineServicePlugin,
  instantiatePluginPackageDefinition,
} from "../src";
import { createPluginHarness } from "../src/test/harness";

/**
 * A package that builds a static site writes it somewhere, and the runtime
 * serves what is there. The directories are the writer's to choose and the
 * host's to read, so the declaration names them and the runtime collects
 * them once after registration — no plugin config introspection.
 * Named consumer: @brains/site-builder.
 */
describe("declared static site output", () => {
  const harness = createPluginHarness({
    logger: createSilentLogger("service-site-output-test"),
  });

  afterEach(async () => {
    await harness.reset();
  });

  const configSchema = z.object({
    outputDir: z.string().default("/tmp/site"),
  });

  it("tells the host where a build writes, from config alone", async () => {
    const [plugin] = instantiatePluginPackageDefinition(
      defineServicePlugin(
        {
          id: "site-builder",
          config: configSchema,
        },
        {
          staticSite: ({ config }) => ({
            productionOutputDir: `${config.outputDir}/production`,
            previewOutputDir: `${config.outputDir}/preview`,
            sharedImagesDir: `${config.outputDir}/images`,
          }),
        },
      ),
      { outputDir: "/srv/brain" },
      { name: "@fixture/site-builder", version: "0.1.0" },
    );
    if (!plugin) throw new Error("Service plugin was not created");

    // Read before installation: the host asks an uninstantiated composition
    // what it would serve, the same way it enumerates routes.
    expect(plugin.getStaticSiteOutput?.()).toEqual({
      productionOutputDir: "/srv/brain/production",
      previewOutputDir: "/srv/brain/preview",
      sharedImagesDir: "/srv/brain/images",
    });

    await harness.installPlugin(plugin);
    expect(plugin.getStaticSiteOutput?.()).toEqual({
      productionOutputDir: "/srv/brain/production",
      previewOutputDir: "/srv/brain/preview",
      sharedImagesDir: "/srv/brain/images",
    });
  });

  it("says nothing when a service writes no site", async () => {
    const [plugin] = instantiatePluginPackageDefinition(
      defineServicePlugin({ id: "quiet", config: z.object({}) }),
      {},
      { name: "@fixture/quiet", version: "0.1.0" },
    );
    if (!plugin) throw new Error("Service plugin was not created");
    await harness.installPlugin(plugin);

    expect(plugin.getStaticSiteOutput?.()).toBeUndefined();
  });
});
