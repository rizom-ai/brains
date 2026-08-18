import { describe, expect, it } from "bun:test";
import { siteMetadataSchema } from "@brains/site-composition";
import { siteBuilderConfigSchema } from "../../src/config";
import { siteBuildJobSchema } from "../../src/types/job-types";

/**
 * Site metadata reaches the renderer by two routes: the message-bus provider
 * and plugin config / job payloads. Both feed the same `buildSiteLayoutInfo`,
 * so a field one route drops is a field the site silently loses — which is what
 * happened when site-builder validated against its own copy of the schema.
 * These tests pin every route to the canonical schema.
 */
describe("site-builder site metadata contract", () => {
  const minimal = { title: "t", description: "d" };

  it("preserves a configured represents through plugin config", () => {
    const config = siteBuilderConfigSchema.parse({
      siteInfo: { ...minimal, represents: "brain" },
    });

    expect(config.siteInfo).toMatchObject({ represents: "brain" });
  });

  it("preserves a configured represents through a build job payload", () => {
    const job = siteBuildJobSchema.parse({
      outputDir: "./dist",
      siteConfig: { ...minimal, represents: "brain" },
    });

    expect(job.siteConfig).toMatchObject({ represents: "brain" });
  });

  it("applies the canonical represents default on every route", () => {
    const viaCanonical = siteMetadataSchema.parse(minimal);
    const viaConfig = siteBuilderConfigSchema.parse({
      siteInfo: minimal,
    }).siteInfo;
    const viaJob = siteBuildJobSchema.parse({
      outputDir: "./dist",
      siteConfig: minimal,
    }).siteConfig;

    expect(viaCanonical).toMatchObject({ represents: "anchor" });
    expect(viaConfig).toEqual(viaCanonical);
    expect(viaJob).toEqual(viaCanonical);
  });

  it("carries a fully populated record identically on every route", () => {
    const full = {
      represents: "brain" as const,
      title: "Rizom",
      description: "A brain",
      url: "https://rizom.ai",
      copyright: "2026",
      logo: true,
      themeMode: "dark" as const,
      analyticsScript: "<script></script>",
      cta: { heading: "h", buttonText: "b", buttonLink: "/l" },
      sections: { hero: { blurb: "welcome" } },
    };

    const expected = siteMetadataSchema.parse(full);

    expect(siteBuilderConfigSchema.parse({ siteInfo: full }).siteInfo).toEqual(
      expected,
    );
    expect(
      siteBuildJobSchema.parse({ outputDir: "./dist", siteConfig: full })
        .siteConfig,
    ).toEqual(expected);
  });
});
