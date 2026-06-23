import { describe, expect, it } from "bun:test";
import { createPluginHarness } from "@brains/plugins/test";
import { BusinessDevelopmentPlugin } from "../src";

describe("BusinessDevelopmentPlugin", () => {
  it("registers the Business Development datasources", async () => {
    const harness = createPluginHarness<BusinessDevelopmentPlugin>({
      dataDir: "/tmp/test-business-development-plugin",
    });
    const plugin = new BusinessDevelopmentPlugin();

    await harness.installPlugin(plugin);

    expect(harness.getDataSources().has("business_development_stack")).toBe(
      true,
    );
    expect(harness.getDataSources().has("business_development_focus")).toBe(
      true,
    );
  });
});
