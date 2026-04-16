import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import { DashboardPlugin } from "../src/plugin";
import type {
  DashboardWidgetRegistry,
  RegisteredWidget,
} from "../src/widget-registry";
import { createPluginHarness } from "@brains/plugins/test";

describe("system widgets (built-in)", () => {
  let harness: ReturnType<typeof createPluginHarness>;
  let plugin: DashboardPlugin;

  const getRegistry = (): DashboardWidgetRegistry => {
    const registry = plugin.getWidgetRegistry();
    expect(registry).not.toBeNull();
    if (!registry) {
      throw new Error("Expected dashboard widget registry to be initialized");
    }
    return registry;
  };

  const getWidget = (id: string): RegisteredWidget => {
    const widget = getRegistry()
      .list()
      .find((entry) => entry.id === id);
    expect(widget).toBeDefined();
    if (!widget) {
      throw new Error(`Expected widget to exist: ${id}`);
    }
    return widget;
  };

  const isRecord = (value: unknown): value is Record<string, unknown> => {
    return typeof value === "object" && value !== null;
  };

  const expectObject = (value: unknown): Record<string, unknown> => {
    if (!isRecord(value)) {
      throw new Error("Expected widget data to be an object");
    }
    return value;
  };

  beforeEach(async () => {
    harness = createPluginHarness({ dataDir: "/tmp/test-datadir" });
    plugin = new DashboardPlugin();
    await harness.installPlugin(plugin);
  });

  afterEach(() => {
    harness.reset();
  });

  it("registers entity-stats, character, profile, and system-info widgets on install", () => {
    const ids = getRegistry()
      .list()
      .map((w) => w.id);

    expect(ids).toContain("entity-stats");
    expect(ids).toContain("character");
    expect(ids).toContain("profile");
    expect(ids).toContain("system-info");
  });

  it("entity-stats provides counts from entityService", async () => {
    const data = expectObject(await getWidget("entity-stats").dataProvider());
    expect(data).toHaveProperty("stats");
  });

  it("character provides identity data", async () => {
    const data = expectObject(await getWidget("character").dataProvider());
    expect(data).toHaveProperty("name");
    expect(data).toHaveProperty("role");
  });

  it("profile provides profile data", async () => {
    const data = expectObject(await getWidget("profile").dataProvider());
    expect(data).toHaveProperty("name");
  });
});
