import { describe, expect, it, beforeEach } from "bun:test";
import { createSiteBuilderPlugin } from "../site-builder-plugin";
import { createPluginHarness } from "@brains/plugins/test";
import { createSilentLogger } from "@brains/test-utils";
import type { Resource } from "@brains/plugins";

describe("Site Builder brain://site resource", () => {
  let resources: Resource[];

  beforeEach(async () => {
    const harness = createPluginHarness({
      logger: createSilentLogger("site-resource-test"),
      domain: "yeehaa.io",
    });

    const plugin = createSiteBuilderPlugin({});
    const capabilities = await harness.installPlugin(plugin);
    resources = capabilities.resources;
  });

  it("should register brain://site resource", () => {
    const resource = resources.find((r) => r.uri === "brain://site");
    expect(resource).toBeDefined();
    expect(resource?.mimeType).toBe("application/json");
  });

  it("should return site metadata as JSON", async () => {
    const resource = resources.find((r) => r.uri === "brain://site");
    if (!resource) throw new Error("brain://site not found");

    const result = await resource.handler();
    const content = result.contents[0];
    if (!content) throw new Error("No content returned");

    expect(content.uri).toBe("brain://site");
    expect(content.mimeType).toBe("application/json");

    const data = JSON.parse(content.text);
    expect(data.title).toBeDefined();
    expect(data.description).toBeDefined();
  });

  it("should include domain URLs when configured", async () => {
    const resource = resources.find((r) => r.uri === "brain://site");
    if (!resource) throw new Error("brain://site not found");

    const result = await resource.handler();
    const content = result.contents[0];
    if (!content) throw new Error("No content returned");

    const data = JSON.parse(content.text);
    expect(data.domain).toBe("yeehaa.io");
    expect(data.siteUrl).toBe("https://yeehaa.io");
    expect(data.previewUrl).toBe("https://preview.yeehaa.io");
  });
});
