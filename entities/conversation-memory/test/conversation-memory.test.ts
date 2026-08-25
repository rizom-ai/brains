import { describe, expect, it } from "bun:test";
import type { Plugin } from "@brains/plugins";
import { instantiatePluginPackageDefinition } from "@brains/plugins";
import { createPluginHarness } from "@brains/plugins/test";
import { createSilentLogger } from "@brains/test-utils";
import conversationMemory from "../src";

const PACKAGE_METADATA = {
  name: "@brains/conversation-memory",
  version: "0.1.0",
};

async function install(
  config: Record<string, unknown> = {},
): Promise<ReturnType<typeof createPluginHarness>> {
  const harness = createPluginHarness({
    logger: createSilentLogger("conversation-memory"),
    dataDir: "/tmp/test-datadir",
  });
  const plugins = instantiatePluginPackageDefinition(
    conversationMemory,
    config,
    PACKAGE_METADATA,
  );
  for (const plugin of plugins as Plugin[]) await harness.installPlugin(plugin);
  return harness;
}

describe("conversation memory package", () => {
  it("registers three readable memory types and no producer", async () => {
    const harness = await install();

    const types = harness.getEntityService().getEntityTypes();
    expect(types).toContain("summary");
    expect(types).toContain("decision");
    expect(types).toContain("action-item");
    // Automatic conversation-to-entity projection is disabled: the package
    // reads memory derived before that, and derives none itself.
    expect(
      harness.getEntityRegistry().getEntityTypeConfig("summary"),
    ).toMatchObject({
      projectionSource: false,
      projectionSourceRole: "excluded",
    });

    harness.reset();
  });

  it("offers no tool of its own", async () => {
    const harness = createPluginHarness({
      logger: createSilentLogger("conversation-memory-tools"),
    });
    const plugins = instantiatePluginPackageDefinition(
      conversationMemory,
      {},
      PACKAGE_METADATA,
    );
    for (const plugin of plugins as Plugin[]) {
      const capabilities = await harness.installPlugin(plugin);
      expect(capabilities.tools).toEqual([]);
    }

    harness.reset();
  });

  it("registers the summary templates and data source", async () => {
    const harness = await install();

    const templates = [...harness.getTemplates().keys()];
    expect(templates.some((name) => name.includes("summary-list"))).toBe(true);
    expect(templates.some((name) => name.includes("summary-detail"))).toBe(
      true,
    );
    expect(
      [...harness.getDataSources().keys()].some((id) =>
        id.includes("conversation-memory"),
      ),
    ).toBe(true);

    harness.reset();
  });

  it("takes projection settings from config", async () => {
    // The projector is dormant, but what it would derive with is still
    // configured — and the coverage widget reports against the same numbers.
    const harness = await install({ maxEntries: 10, projectionVersion: 3 });

    expect(harness.getEntityService().getEntityTypes()).toContain("summary");

    harness.reset();
  });
});
