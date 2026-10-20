import { describe, expect, it } from "bun:test";
import { createPluginHarness } from "@brains/plugins/test";
import { DocsPlugin } from "../src/plugin";

describe("DocsPlugin", () => {
  it("retires sourcePath, which nothing reads", async () => {
    const harness = createPluginHarness<DocsPlugin>({
      dataDir: "/tmp/test-docs-retired",
    });
    await harness.installPlugin(new DocsPlugin());

    expect(
      harness.getEntityRegistry().getEntityTypeConfig("doc").retiredFields,
    ).toEqual(["sourcePath"]);
    await harness.reset();
  });
});
