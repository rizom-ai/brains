import { describe, it, expect } from "bun:test";
import { createPluginHarness } from "@brains/plugins/test";
import { createSilentLogger } from "@brains/test-utils";
import { WhitepaperPlugin, whitepaperPlugin } from "../src/plugin";
import packageJson from "../package.json";

describe("WhitepaperPlugin", () => {
  it("registers as an entity plugin", async () => {
    const plugin = new WhitepaperPlugin();
    const harness = createPluginHarness({
      logger: createSilentLogger("whitepaper-test"),
    });

    await harness.installPlugin(plugin);

    expect(plugin.id).toBe("whitepaper");
    expect(plugin.type).toBe("entity");
    expect(plugin.entityType).toBe("whitepaper");
    expect(harness.getEntityService().getEntityTypes()).toContain("whitepaper");

    harness.reset();
  });

  it("has expected metadata", () => {
    const plugin = whitepaperPlugin() as WhitepaperPlugin;

    expect(plugin.id).toBe("whitepaper");
    expect(plugin.version).toBe(packageJson.version);
    expect(plugin.adapter.entityType).toBe("whitepaper");
  });

  it("marks published as a publish status", () => {
    const plugin = new WhitepaperPlugin();

    expect(plugin.getEntityTypeConfig()?.publish).toEqual({
      publishStatuses: ["published"],
    });
  });
});
