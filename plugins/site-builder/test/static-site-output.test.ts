import { describe, expect, it } from "bun:test";
import { SiteBuilderPlugin } from "../src/plugin";

// The runtime's HTTP host serves what the site builder writes: the builder's
// output directories are the serving paths, so a builder writing elsewhere
// is still the site its brain serves.
describe("the site builder's served output", () => {
  it("names the directories it writes", () => {
    const plugin = new SiteBuilderPlugin({
      productionOutputDir: "./out/production",
      previewOutputDir: "./out/preview",
      sharedImagesDir: "./out/images",
    });

    expect(plugin.getStaticSiteOutput()).toEqual({
      productionOutputDir: "./out/production",
      previewOutputDir: "./out/preview",
      sharedImagesDir: "./out/images",
    });
  });

  it("names its default directories when none are configured", () => {
    expect(new SiteBuilderPlugin().getStaticSiteOutput()).toEqual({
      productionOutputDir: "./dist/site-production",
      previewOutputDir: "./dist/site-preview",
      sharedImagesDir: "./dist/images",
    });
  });
});
