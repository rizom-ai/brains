import { beforeEach, describe, expect, it, afterEach } from "bun:test";
import { PluginTestHarness } from "@brains/utils";
import { WebserverPlugin } from "../src/webserver-plugin";

describe("webserver promote_section tool", () => {
  let plugin: WebserverPlugin;
  let harness: PluginTestHarness;

  beforeEach(async () => {
    harness = new PluginTestHarness();
    plugin = new WebserverPlugin({});
    await harness.installPlugin(plugin);
  });

  afterEach(async () => {
    await harness.cleanup();
  });

  it("should have promote_section tool", async () => {
    const context = harness.getPluginContext();
    const capabilities = await plugin.register(context);

    const promoteTool = capabilities.tools.find(
      (t) => t.name === "webserver:promote_section",
    );

    expect(promoteTool).toBeDefined();
    expect(promoteTool?.description).toBe(
      "Promote a generated content section to editable site content",
    );
  });

  it("should validate input schema", async () => {
    const context = harness.getPluginContext();
    const capabilities = await plugin.register(context);

    const promoteTool = capabilities.tools.find(
      (t) => t.name === "webserver:promote_section",
    );

    // The input schema should require generatedContentId
    expect(promoteTool?.inputSchema).toHaveProperty("generatedContentId");
  });
});
