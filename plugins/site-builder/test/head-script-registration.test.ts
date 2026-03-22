import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { createPluginHarness } from "@brains/plugins/test";
import { SiteBuilderPlugin } from "../src/plugin";

describe("Head script registration", () => {
  let harness: ReturnType<typeof createPluginHarness>;
  let plugin: SiteBuilderPlugin;
  beforeEach(async () => {
    harness = createPluginHarness({ dataDir: "/tmp/test-head-scripts" });
    plugin = new SiteBuilderPlugin({});
    await harness.installPlugin(plugin);
  });

  afterEach(() => {
    harness.reset();
  });

  it("should accept head script registration via message", async () => {
    await harness.sendMessage(
      "plugin:site-builder:head-script:register",
      {
        pluginId: "analytics",
        script:
          '<script defer src="https://example.com/beacon.min.js"></script>',
        position: "end",
      },
      "analytics",
    );
  });

  it("should store multiple registered head scripts", async () => {
    await harness.sendMessage(
      "plugin:site-builder:head-script:register",
      {
        pluginId: "analytics",
        script: '<script src="analytics.js"></script>',
      },
      "analytics",
    );

    await harness.sendMessage(
      "plugin:site-builder:head-script:register",
      {
        pluginId: "newsletter",
        script: '<script src="newsletter.js"></script>',
      },
      "newsletter",
    );

    const scripts = plugin.getRegisteredHeadScripts();
    expect(scripts).toHaveLength(2);
    expect(scripts[0]).toContain("analytics.js");
    expect(scripts[1]).toContain("newsletter.js");
  });

  it("should not duplicate scripts from the same plugin", async () => {
    await harness.sendMessage(
      "plugin:site-builder:head-script:register",
      {
        pluginId: "analytics",
        script: '<script src="v1.js"></script>',
      },
      "analytics",
    );

    await harness.sendMessage(
      "plugin:site-builder:head-script:register",
      {
        pluginId: "analytics",
        script: '<script src="v2.js"></script>',
      },
      "analytics",
    );

    const scripts = plugin.getRegisteredHeadScripts();
    expect(scripts).toHaveLength(1);
    expect(scripts[0]).toContain("v2.js");
  });
});
