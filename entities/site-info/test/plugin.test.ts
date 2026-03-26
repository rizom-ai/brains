import { describe, it, expect, beforeEach } from "bun:test";
import { createPluginHarness } from "@brains/plugins/test";
import { SiteInfoPlugin } from "../src/plugin";

describe("SiteInfoPlugin", () => {
  let harness: ReturnType<typeof createPluginHarness>;

  beforeEach(() => {
    harness = createPluginHarness({ dataDir: "/tmp/test-site-info" });
  });

  it("should register as entity plugin", async () => {
    const plugin = new SiteInfoPlugin();
    await harness.installPlugin(plugin);

    expect(plugin.type).toBe("entity");
    expect(plugin.id).toBe("site-info");
  });

  it("should register site-info entity type", async () => {
    const plugin = new SiteInfoPlugin();
    await harness.installPlugin(plugin);

    expect(harness.getEntityService().getEntityTypes()).toContain("site-info");
  });

  it("should return zero tools", async () => {
    const plugin = new SiteInfoPlugin();
    const capabilities = await harness.installPlugin(plugin);

    expect(capabilities.tools).toHaveLength(0);
  });

  it("should register datasource", async () => {
    const plugin = new SiteInfoPlugin();
    await harness.installPlugin(plugin);

    const dataSources = harness.getDataSources();
    const ids = Array.from(dataSources.keys());
    expect(ids.some((id) => id.includes("site-info"))).toBe(true);
  });
});
