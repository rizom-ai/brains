import { describe, it, expect, afterEach } from "bun:test";
import { createPluginHarness } from "@brains/plugins/test";
import { createServicePluginContext } from "@brains/plugins";
import { SITE_BUILDER_CHANNELS } from "@brains/contracts";
import { SiteBuilderPlugin } from "../src/plugin";

// The site builds in the worker process, which registers plugins but takes
// no ordinary subscriptions and never runs their ready phase. Head scripts
// other plugins contribute are therefore asked for when a build runs.
describe("Head scripts at build time", () => {
  const harness = createPluginHarness({ dataDir: "/tmp/test-head-scripts" });

  afterEach(async () => {
    await harness.reset();
  });

  async function workerSiteBuilder(
    headScripts: string[] = [],
  ): Promise<SiteBuilderPlugin> {
    const plugin = new SiteBuilderPlugin({ headScripts });
    await plugin.register(harness.getMockShell(), { executionOnly: true });
    return plugin;
  }

  function contribute(pluginId: string, data: unknown): void {
    createServicePluginContext(harness.getMockShell(), pluginId, {
      executionOnly: true,
    }).messaging.subscribeExecution(
      SITE_BUILDER_CHANNELS.headScripts,
      async () => ({ success: true, data }),
    );
  }

  it("collects contributed scripts in the worker, after the site package's own", async () => {
    const plugin = await workerSiteBuilder([
      '<script src="/boot.js"></script>',
    ]);
    contribute("analytics", '<script src="beacon.min.js"></script>');

    expect(await plugin.getHeadScripts()).toEqual([
      '<script src="/boot.js"></script>',
      '<script src="beacon.min.js"></script>',
    ]);
  });

  it("asks again on every build, so a late contributor is included", async () => {
    const plugin = await workerSiteBuilder();
    expect(await plugin.getHeadScripts()).toEqual([]);

    contribute("analytics", '<script src="beacon.min.js"></script>');

    expect(await plugin.getHeadScripts()).toEqual([
      '<script src="beacon.min.js"></script>',
    ]);
  });

  it("skips an answer that carries no script", async () => {
    const plugin = await workerSiteBuilder();
    contribute("broken", { script: 42 });
    contribute("analytics", '<script src="beacon.min.js"></script>');

    expect(await plugin.getHeadScripts()).toEqual([
      '<script src="beacon.min.js"></script>',
    ]);
  });
});
