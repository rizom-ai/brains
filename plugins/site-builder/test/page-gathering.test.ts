import { afterEach, describe, expect, it } from "bun:test";
import { createPluginHarness } from "@brains/plugins/test";
import { createServicePluginContext } from "@brains/plugins";
import {
  RouteDefinitionSchema,
  siteBuilderPagesContract,
} from "@brains/site-composition";
import { RouteRegistry } from "@brains/site-engine";
import { createSilentLogger } from "@brains/test-utils";
import {
  createSiteBuilderPlugin,
  type SiteBuilderTestPlugin,
} from "./site-builder-plugin";
import { withGatheredPages } from "../src/lib/collect-build-routes";

const page = (id: string, path: string): unknown => ({
  id,
  path,
  title: id,
  sections: [{ id: "form", template: "quiz:page", content: { slot: id } }],
  navigation: { show: false },
});

// Pages a plugin learns of from content, such as forms defined in the brain,
// are asked for when a build runs: the worker that builds never hears a
// registration made after it booted.
describe("pages at build time", () => {
  const harness = createPluginHarness({ dataDir: "/tmp/test-site-pages" });

  afterEach(async () => {
    await harness.reset();
  });

  async function workerSiteBuilder(): Promise<SiteBuilderTestPlugin> {
    const plugin = createSiteBuilderPlugin({});
    await plugin.register(harness.getMockShell(), { executionOnly: true });
    return plugin;
  }

  function contribute(pluginId: string, data: unknown): void {
    createServicePluginContext(harness.getMockShell(), pluginId, {
      executionOnly: true,
    }).messaging.subscribeExecution(
      siteBuilderPagesContract.name,
      async () => ({
        success: true,
        data,
      }),
    );
  }

  it("collects each plugin's pages in the worker, asking again on every build", async () => {
    const plugin = await workerSiteBuilder();
    expect(await plugin.getPages()).toEqual([]);
    contribute("quiz", [page("brand-test", "/brand-test")]);
    contribute("broken", [{ path: 42 }]);
    expect(await plugin.getPages()).toEqual([
      RouteDefinitionSchema.parse(page("brand-test", "/brand-test")),
    ]);
  });

  it("adds gathered pages to a build without displacing a registered route", () => {
    const registry = new RouteRegistry(createSilentLogger("test"));
    registry.register(
      RouteDefinitionSchema.parse({
        id: "about",
        path: "/about",
        sections: [],
        navigation: { show: false },
      }),
    );
    const pages = [
      RouteDefinitionSchema.parse(page("brand-test", "/brand-test")),
      RouteDefinitionSchema.parse(page("about-form", "/about")),
    ];
    const built = withGatheredPages(registry, pages);
    expect(built.list().map((route) => route.id)).toEqual([
      "about",
      "brand-test",
    ]);
    // Nothing is kept: the next build asks again.
    expect(registry.list().map((route) => route.id)).toEqual(["about"]);
  });
});
