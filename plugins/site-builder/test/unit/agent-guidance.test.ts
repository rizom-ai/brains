import { afterEach, describe, expect, it } from "bun:test";
import { createPluginHarness } from "@brains/plugins/test";
import { SiteBuilderPlugin } from "../../src/plugin";
import { createSiteBuilderTools } from "../../src/tools";

class TestSiteBuilderPlugin extends SiteBuilderPlugin {
  public instructions(): Promise<string | undefined> {
    return this.getInstructions();
  }
}

// The build guidance travels with the build tool: its description reaches the
// model only when the caller may build, and once per step.
describe("site-builder agent guidance", () => {
  const harness = createPluginHarness({ dataDir: "/tmp/test-site-guidance" });

  afterEach(async () => {
    await harness.reset();
  });

  it("describes when to build on the build tool", () => {
    const [buildSite] = createSiteBuilderTools("site-builder", () => {});

    expect(buildSite?.description).toContain(
      "build, rebuild, publish, or build the website/site again",
    );
    expect(buildSite?.description).toContain(
      "Never say a build was started, queued, or requested unless this turn called this tool.",
    );
  });

  it("keeps only the site facts in the prompt", async () => {
    const plugin = new TestSiteBuilderPlugin({});
    await plugin.register(harness.getMockShell());
    const instructions = await plugin.instructions();

    expect(instructions).toContain("## Your Site");
    expect(instructions).not.toContain("Site Builder Actions");
  });
});
