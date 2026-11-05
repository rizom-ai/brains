import { describe, expect, it } from "bun:test";
import { createPluginHarness } from "@brains/plugins/test";
import { SITE_METADATA_GET_CHANNEL } from "@brains/site-composition";
import { SiteBuilderPlugin } from "../../src/plugin";
import { z } from "@brains/utils/zod";

/** The site resource body, parsed rather than asserted: it arrives as JSON text. */
const siteResourceContentSchema = z.looseObject({
  title: z.string(),
  description: z.string(),
  cta: z
    .looseObject({
      heading: z.string(),
      buttonText: z.string(),
      buttonLink: z.string(),
    })
    .optional(),
});

describe("site-builder metadata provider contract", () => {
  it("uses metadata from the shared provider channel for brain://site", async () => {
    const harness = createPluginHarness();
    harness.subscribe(SITE_METADATA_GET_CHANNEL, () => ({
      success: true,
      data: {
        title: "Provided Site",
        description: "Provided metadata",
        cta: {
          heading: "Join",
          buttonText: "Start",
          buttonLink: "/start",
        },
      },
    }));

    const capabilities = await harness.installPlugin(new SiteBuilderPlugin({}));
    const resource = capabilities.resources.find(
      (r) => r.uri === "brain://site",
    );
    if (!resource) throw new Error("brain://site not found");

    const result = await resource.handler();
    const data = siteResourceContentSchema.parse(
      JSON.parse(result.contents[0]?.text ?? "{}"),
    );

    expect(data.title).toBe("Provided Site");
    expect(data.description).toBe("Provided metadata");
    expect(data.cta?.buttonText).toBe("Start");
  });

  it("keeps the site's chrome in its other languages", async () => {
    const harness = createPluginHarness();
    harness.subscribe(SITE_METADATA_GET_CHANNEL, () => ({
      success: true,
      data: {
        title: "The Fourth",
        description: "Brand consultancy",
        translations: { "zh-TW": { title: "第四", copyright: "©2026 第四" } },
      },
    }));

    const capabilities = await harness.installPlugin(new SiteBuilderPlugin({}));
    const resource = capabilities.resources.find(
      (r) => r.uri === "brain://site",
    );
    if (!resource) throw new Error("brain://site not found");
    const result = await resource.handler();
    const data = z
      .looseObject({
        translations: z.record(
          z.string(),
          z.object({ title: z.string(), copyright: z.string() }),
        ),
      })
      .parse(JSON.parse(result.contents[0]?.text ?? "{}"));

    expect(data.translations["zh-TW"]).toEqual({
      title: "第四",
      copyright: "©2026 第四",
    });
  });

  it("falls back to configured metadata when no provider is registered", async () => {
    const harness = createPluginHarness();
    const capabilities = await harness.installPlugin(
      new SiteBuilderPlugin({
        siteInfo: {
          title: "Fallback Site",
          description: "Fallback metadata",
        },
      }),
    );
    const resource = capabilities.resources.find(
      (r) => r.uri === "brain://site",
    );
    if (!resource) throw new Error("brain://site not found");

    const result = await resource.handler();
    const data = siteResourceContentSchema.parse(
      JSON.parse(result.contents[0]?.text ?? "{}"),
    );

    expect(data.title).toBe("Fallback Site");
    expect(data.description).toBe("Fallback metadata");
  });
});
