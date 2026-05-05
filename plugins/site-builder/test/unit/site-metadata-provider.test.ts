import { describe, expect, it } from "bun:test";
import { createPluginHarness } from "@brains/plugins/test";
import { SITE_METADATA_GET_CHANNEL } from "@brains/site-composition";
import { SiteBuilderPlugin } from "../../src/plugin";

interface SiteResourceContent {
  title: string;
  description: string;
  cta?: {
    heading: string;
    buttonText: string;
    buttonLink: string;
  };
}

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
    const data = JSON.parse(
      result.contents[0]?.text ?? "{}",
    ) as SiteResourceContent;

    expect(data.title).toBe("Provided Site");
    expect(data.description).toBe("Provided metadata");
    expect(data.cta?.buttonText).toBe("Start");
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
    const data = JSON.parse(
      result.contents[0]?.text ?? "{}",
    ) as SiteResourceContent;

    expect(data.title).toBe("Fallback Site");
    expect(data.description).toBe("Fallback metadata");
  });
});
