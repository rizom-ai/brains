import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import {
  createPluginHarness,
  type PluginTestHarness,
} from "@brains/plugins/test";
import { z } from "@brains/utils/zod";
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

  it("hands its configured chrome to the guide pages, and none by default", async () => {
    const chrome = { brand: { label: "brains docs", href: "/docs" } };
    const configured = createPluginHarness<GuidesPlugin>({
      dataDir: "/tmp/test-guides-chrome",
    });
    await configured.installPlugin(new GuidesPlugin({ chrome }));

    for (const [subject, expected] of [
      [configured, chrome],
      [harness, undefined],
    ] as const) {
      const schema = subject.getTemplates().get("guides:guide-list")?.schema;
      const source = subject.getDataSources().get("guides:entities");
      if (!schema || !source?.fetch) throw new Error("guides not registered");
      const page = z.record(z.string(), z.unknown()).parse(
        await source.fetch({}, schema, {
          entityService: subject.getEntityService(),
        }),
      );
      if (expected) expect(page["chrome"]).toMatchObject(expected);
      else expect(page["chrome"]).toBeNull();
    }
    await configured.reset();
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
