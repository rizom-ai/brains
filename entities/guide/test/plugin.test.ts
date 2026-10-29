import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import {
  createPluginHarness,
  type PluginTestHarness,
} from "@brains/plugins/test";
import { GuidesPlugin } from "../src";

describe("GuidesPlugin", () => {
  let harness: PluginTestHarness<GuidesPlugin>;

  beforeEach(async () => {
    harness = createPluginHarness<GuidesPlugin>({
      dataDir: "/tmp/test-guides",
    });
    await harness.installPlugin(new GuidesPlugin());
  });

  afterEach(async () => {
    await harness.reset();
  });

  it("is the guides plugin", () => {
    expect(harness.getPlugin().id).toBe("guides");
  });

  it("registers guides as reference content the agent reads from", () => {
    expect(harness.getEntityService().getEntityTypes()).toContain("guide");
    expect(
      harness.getEntityRegistry().getEntityTypeConfig("guide"),
    ).toMatchObject({ projectionSourceRole: "primary" });
  });

  it("registers the guide templates and their data source", () => {
    const templates = Array.from(harness.getTemplates().keys());
    expect(templates).toEqual(
      expect.arrayContaining([
        "guides:guide-list",
        "guides:guide-detail",
        "guides:guide-band",
      ]),
    );
    expect(Array.from(harness.getDataSources().keys())).toContain(
      "guides:entities",
    );
  });
});
