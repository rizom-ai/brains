import { describe, expect, it } from "bun:test";
import { z } from "@brains/utils/zod";
import {
  defineServicePlugin,
  instantiatePluginPackageDefinition,
  withStaticSiteOutput,
  type PluginPackageDefinition,
  type ServicePackageDefinition,
} from "../src";

/**
 * A first-party site builder converted from a class declares where it writes
 * the site the runtime's HTTP host serves, as its class did, from its parsed
 * config; the host reads it once, when it starts.
 */

const config = z.object({
  productionOutputDir: z.string().default("./dist/site-production"),
  previewOutputDir: z.string().default("./dist/site-preview"),
});

function plugin(
  definition: PluginPackageDefinition,
  input: unknown = {},
): ReturnType<typeof instantiatePluginPackageDefinition>[number] {
  const [created] = instantiatePluginPackageDefinition(
    definition,
    input,
    { name: "@brains/probe", version: "0.1.0" },
    { pluginId: "probe" },
  );
  if (!created) throw new Error("No plugin was created");
  return created;
}

describe("withStaticSiteOutput", () => {
  const builder = withStaticSiteOutput(
    defineServicePlugin({ id: "probe", config }),
    ({ config: parsed }) => ({
      productionOutputDir: parsed.productionOutputDir,
      previewOutputDir: parsed.previewOutputDir,
      sharedImagesDir: "./dist/images",
    }),
  );

  it("declares the directories it writes, from its parsed config", () => {
    expect(
      plugin(builder, {
        previewOutputDir: "/srv/preview",
      }).getStaticSiteOutput?.(),
    ).toEqual({
      productionOutputDir: "./dist/site-production",
      previewOutputDir: "/srv/preview",
      sharedImagesDir: "./dist/images",
    });
  });

  it("declares none without one", () => {
    expect(
      plugin(
        defineServicePlugin({ id: "probe", config }),
      ).getStaticSiteOutput?.(),
    ).toBeUndefined();
  });

  it("is declared once, on a definition defineServicePlugin returned", () => {
    expect(() =>
      withStaticSiteOutput(builder, () => ({
        productionOutputDir: "a",
        previewOutputDir: "b",
        sharedImagesDir: "c",
      })),
    ).toThrow('Service "probe" declares its static site output more than once');
    const forged: ServicePackageDefinition<typeof config> = {
      ...defineServicePlugin({ id: "probe", config }),
    };
    expect(() =>
      withStaticSiteOutput(forged, () => ({
        productionOutputDir: "a",
        previewOutputDir: "b",
        sharedImagesDir: "c",
      })),
    ).toThrow(
      'withStaticSiteOutput takes a definition defineServicePlugin returned; "probe" is not one',
    );
  });
});
