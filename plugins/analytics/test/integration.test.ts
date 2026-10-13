import { describe, it, expect, afterEach } from "bun:test";
import { createPluginHarness } from "@brains/plugins/test";
import { AnalyticsPlugin } from "../src/index";
import type { CloudflareFetch } from "../src/lib/cloudflare-client";
import packageJson from "../package.json";

const noFetch: CloudflareFetch = async () =>
  new Response("unexpected request", { status: 500 });

const cloudflare = {
  accountId: "test_account",
  apiToken: "test_token",
  siteTag: "test_site",
};

describe("AnalyticsPlugin Integration", () => {
  let harness: ReturnType<typeof createPluginHarness> | undefined;

  afterEach(async () => {
    await harness?.reset();
  });

  function reportTypes(): string[] {
    if (!harness) throw new Error("No harness");
    return harness
      .getMockShell()
      .getAnalyticsRegistry()
      .getDefinitions()
      .map((definition) => definition.type);
  }

  it("registers with its package metadata", async () => {
    harness = createPluginHarness();
    const plugin = new AnalyticsPlugin({ cloudflare }, { fetch: noFetch });
    await harness.installPlugin(plugin);

    expect(plugin.id).toBe("analytics");
    expect(plugin.type).toBe("service");
    expect(plugin.version).toBe(packageJson.version);
  });

  // Traffic is asked through system_analytics; the plugin has no tool of its
  // own, and analytics_query is gone.
  it("adds its traffic reports to system_analytics, and no tool", async () => {
    harness = createPluginHarness();
    const capabilities = await harness.installPlugin(
      new AnalyticsPlugin({ cloudflare }, { fetch: noFetch }),
    );

    expect(capabilities.tools).toEqual([]);
    expect(reportTypes()).toEqual(
      expect.arrayContaining([
        "traffic-overview",
        "traffic-series",
        "traffic-by-entity",
      ]),
    );
  });

  // The reports read the stored snapshots, which outlive the Cloudflare setup.
  it("adds the reports without Cloudflare too", async () => {
    harness = createPluginHarness();
    await harness.installPlugin(new AnalyticsPlugin({}));

    expect(reportTypes()).toEqual(
      expect.arrayContaining([
        "traffic-overview",
        "traffic-series",
        "traffic-by-entity",
      ]),
    );
  });
});
