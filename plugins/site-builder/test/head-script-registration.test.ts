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
    const shell = harness.getShell();
    const messageBus = shell.getMessageBus();

    const response = await messageBus.send(
      "plugin:site-builder:head-script:register",
      {
        pluginId: "analytics",
        script:
          '<script defer src="https://example.com/beacon.min.js"></script>',
        position: "end", // end of <head>
      },
      "analytics",
    );

    expect(response).toBeDefined();
  });

  it("should store multiple registered head scripts", async () => {
    const shell = harness.getShell();
    const messageBus = shell.getMessageBus();

    await messageBus.send(
      "plugin:site-builder:head-script:register",
      {
        pluginId: "analytics",
        script: '<script src="analytics.js"></script>',
      },
      "analytics",
    );

    await messageBus.send(
      "plugin:site-builder:head-script:register",
      {
        pluginId: "newsletter",
        script: '<script src="newsletter.js"></script>',
      },
      "newsletter",
    );

    // The registered scripts should be accessible for the build
    const scripts = plugin.getRegisteredHeadScripts();
    expect(scripts).toHaveLength(2);
    expect(scripts[0]).toContain("analytics.js");
    expect(scripts[1]).toContain("newsletter.js");
  });

  it("should not duplicate scripts from the same plugin", async () => {
    const shell = harness.getShell();
    const messageBus = shell.getMessageBus();

    await messageBus.send(
      "plugin:site-builder:head-script:register",
      {
        pluginId: "analytics",
        script: '<script src="v1.js"></script>',
      },
      "analytics",
    );

    // Re-register from same plugin replaces
    await messageBus.send(
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
