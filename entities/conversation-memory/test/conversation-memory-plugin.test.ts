import { beforeEach, describe, expect, it } from "bun:test";
import { ConversationMemoryPlugin } from "../src";
import {
  createPluginHarness,
  type PluginTestHarness,
} from "@brains/plugins/test";

describe("ConversationMemoryPlugin", () => {
  let harness: PluginTestHarness<ConversationMemoryPlugin>;
  let plugin: ConversationMemoryPlugin;

  beforeEach(() => {
    harness = createPluginHarness<ConversationMemoryPlugin>({
      dataDir: "/tmp/test-datadir",
    });
    plugin = new ConversationMemoryPlugin();
  });

  it("registers memory entity readers without an automatic producer", async () => {
    const capabilities = await harness.installPlugin(plugin);

    expect(plugin.id).toBe("conversation-memory");
    expect(plugin.type).toBe("entity");
    expect(harness.getEntityService().getEntityTypes()).toContain("summary");
    expect(harness.getEntityService().getEntityTypes()).toContain("decision");
    expect(harness.getEntityService().getEntityTypes()).toContain(
      "action-item",
    );
    expect(capabilities.projectionRules).toBeUndefined();
    expect("projections" in capabilities).toBe(false);
  });

  it("keeps memory entities immutable through entity CRUD", () => {
    expect(plugin.entityActionPolicy).toEqual({
      summary: {
        create: "never",
        update: "never",
        delete: "never",
        extract: "never",
        publish: "never",
      },
    });
  });

  it("keeps projector configuration for explicit evaluations", async () => {
    await harness.installPlugin(plugin);
    const config = plugin.getConfig();

    expect(config.maxSourceMessages).toBe(1000);
    expect(config.maxMessagesPerChunk).toBe(40);
    expect(config.maxEntries).toBe(50);
    expect(config.projectionVersion).toBe(1);
    expect(
      harness.getEntityRegistry().getEntityTypeConfig("summary"),
    ).toMatchObject({
      projectionSource: false,
      projectionSourceRole: "excluded",
    });
  });

  it("accepts custom evaluation config", async () => {
    const customPlugin = new ConversationMemoryPlugin({ maxEntries: 10 });
    await harness.installPlugin(customPlugin);

    expect(customPlugin.getConfig().maxEntries).toBe(10);
  });

  it("registers no tools, plus templates and datasource", async () => {
    const capabilities = await harness.installPlugin(plugin);

    expect(capabilities.tools).toHaveLength(0);
    expect(
      Array.from(harness.getTemplates().keys()).some((name) =>
        name.includes("summary-list"),
      ),
    ).toBe(true);
    expect(
      Array.from(harness.getTemplates().keys()).some((name) =>
        name.includes("summary-detail"),
      ),
    ).toBe(true);
    expect(
      Array.from(harness.getDataSources().keys()).some((id) =>
        id.includes("conversation-memory"),
      ),
    ).toBe(true);
  });
});
