import { describe, it, expect, afterEach } from "bun:test";
import { createPluginHarness } from "@brains/plugins/test";
import { createServicePluginContext } from "@brains/plugins";
import { SITE_BUILDER_CHANNELS } from "@brains/contracts";
import { SiteBuilderPlugin } from "../../src/plugin";
import { createTestConfig } from "../test-helpers";

// The site builds in the worker process, which registers plugins but takes
// no ordinary subscriptions and never runs their ready phase. Slot content
// other plugins contribute is therefore asked for when a build runs.
describe("Site-builder slots at build time", () => {
  const harness = createPluginHarness<SiteBuilderPlugin>();

  afterEach(async () => {
    await harness.reset();
  });

  async function workerSiteBuilder(): Promise<SiteBuilderPlugin> {
    const plugin = new SiteBuilderPlugin(
      createTestConfig({
        previewOutputDir: "/tmp/test-output",
        productionOutputDir: "/tmp/test-output-production",
      }),
    );
    await plugin.register(harness.getMockShell(), { executionOnly: true });
    return plugin;
  }

  function contribute(pluginId: string, data: unknown): void {
    createServicePluginContext(harness.getMockShell(), pluginId, {
      executionOnly: true,
    }).messaging.subscribeExecution(SITE_BUILDER_CHANNELS.slots, async () => ({
      success: true,
      data,
    }));
  }

  it("collects contributed slots in the worker", async () => {
    const plugin = await workerSiteBuilder();
    contribute("newsletter", [
      {
        pluginId: "newsletter",
        slotName: "footer-top",
        render: (): null => null,
      },
    ]);

    const slots = await plugin.getSlots();

    expect(slots.hasSlot("footer-top")).toBe(true);
    expect(slots.getSlot("footer-top").map((slot) => slot.pluginId)).toEqual([
      "newsletter",
    ]);
  });

  it("orders a slot's contributions by priority, highest first", async () => {
    const plugin = await workerSiteBuilder();
    contribute("low", [
      {
        pluginId: "low",
        slotName: "footer-top",
        render: (): null => null,
        priority: 10,
      },
    ]);
    contribute("high", [
      {
        pluginId: "high",
        slotName: "footer-top",
        render: (): null => null,
        priority: 100,
      },
    ]);

    const slots = await plugin.getSlots();

    expect(slots.getSlot("footer-top").map((slot) => slot.pluginId)).toEqual([
      "high",
      "low",
    ]);
  });

  it("takes several slots from one contributor", async () => {
    const plugin = await workerSiteBuilder();
    contribute("widgets", [
      { pluginId: "widgets", slotName: "footer-top", render: (): null => null },
      { pluginId: "widgets", slotName: "sidebar", render: (): null => null },
    ]);

    const slots = await plugin.getSlots();

    expect(slots.hasSlot("footer-top")).toBe(true);
    expect(slots.hasSlot("sidebar")).toBe(true);
  });

  it("asks again on every build and skips malformed answers", async () => {
    const plugin = await workerSiteBuilder();
    expect((await plugin.getSlots()).hasSlot("footer-top")).toBe(false);

    contribute("broken", [{ pluginId: "broken", slotName: "footer-top" }]);
    contribute("newsletter", [
      {
        pluginId: "newsletter",
        slotName: "footer-top",
        render: (): null => null,
      },
    ]);

    expect(
      (await plugin.getSlots()).getSlot("footer-top").map((s) => s.pluginId),
    ).toEqual(["newsletter"]);
  });
});
