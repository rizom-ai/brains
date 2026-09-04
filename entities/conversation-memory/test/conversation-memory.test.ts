import { describe, expect, it } from "bun:test";

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
  for (const plugin of plugins) await harness.installPlugin(plugin);
  return harness;
}

describe("conversation memory package", () => {
  it("registers three readable memory types and the producer graph", async () => {
    const harness = createPluginHarness({
      logger: createSilentLogger("conversation-memory-rules"),
      dataDir: "/tmp/test-datadir",
    });
    const plugins = instantiatePluginPackageDefinition(
      conversationMemory,
      {},
      PACKAGE_METADATA,
    );
    const ruleIds: string[] = [];
    for (const plugin of plugins) {
      const capabilities = await harness.installPlugin(plugin);
      ruleIds.push(
        ...(capabilities.projectionRules?.map((rule) => rule.id) ?? []),
      );
    }

    const types = harness.getEntityService().getEntityTypes();
    expect(types).toContain("summary");
    expect(types).toContain("decision");
    expect(types).toContain("action-item");
    expect(ruleIds).toEqual([
      "summary-derivation",
      "summary-decision-derivation",
      "summary-action-item-derivation",
    ]);
    // The summary stays excluded from generic source discovery; its two
    // package-owned downstream rules name it explicitly.
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
    for (const plugin of plugins) {
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
    expect(templates).toContain(
      "@brains/conversation-memory:summary:ai-response",
    );
    expect(
      [...harness.getDataSources().keys()].some((id) =>
        id.includes("conversation-memory"),
      ),
    ).toBe(true);

    harness.reset();
  });

  it("takes projection settings from config", async () => {
    const harness = await install({ maxEntries: 10, projectionVersion: 3 });

    expect(harness.getEntityService().getEntityTypes()).toContain("summary");

    harness.reset();
  });
});
