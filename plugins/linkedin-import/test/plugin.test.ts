import { describe, expect, it } from "bun:test";
import { createPluginHarness } from "@brains/plugins/test";
import { LinkedInImportPlugin } from "../src/plugin";

describe("LinkedInImportPlugin", () => {
  it("is inert without an access token", async () => {
    const harness = createPluginHarness();
    const plugin = new LinkedInImportPlugin();

    await harness.installPlugin(plugin);

    expect(
      harness
        .getCapabilities()
        .tools.filter((tool) => tool.name.startsWith("linkedin-import")),
    ).toEqual([]);
  });

  it("registers import and schema inspection tools when configured", async () => {
    const harness = createPluginHarness();
    const plugin = new LinkedInImportPlugin({ accessToken: "test-token" });

    await harness.installPlugin(plugin);

    expect(
      harness
        .getCapabilities()
        .tools.filter((tool) => tool.name.startsWith("linkedin-import"))
        .map((tool) => tool.name),
    ).toEqual(["linkedin-import_import", "linkedin-import_inspect_schema"]);
  });
});
