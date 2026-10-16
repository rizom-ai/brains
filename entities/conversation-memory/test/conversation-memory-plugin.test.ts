import { beforeEach, describe, expect, it, spyOn } from "bun:test";
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

  it("guards action-item status changes with a persist validator", async () => {
    const register = spyOn(
      harness.getEntityRegistry(),
      "registerPersistValidator",
    );
    await harness.installPlugin(plugin);

    expect(register).toHaveBeenCalledWith("action-item", expect.any(Function));
  });

  it("opens the Board in Studio when ready and closes it on shutdown", async () => {
    await harness.installPlugin(plugin);
    const bus = harness.getMockShell().getMessageBus();
    const registered: string[] = [];
    const unregistered: unknown[] = [];
    bus.subscribe<{ id: string }, { workspaceUrl: string }>(
      "studio:register-workspace",
      async (message) => {
        registered.push(message.payload.id);
        return { success: true, data: { workspaceUrl: "/studio/board" } };
      },
    );
    bus.subscribe("studio:unregister-workspace", async (message) => {
      unregistered.push(message.payload);
      return { success: true };
    });

    await plugin.ready();
    await plugin.shutdown();

    expect(registered).toEqual(["conversation-memory:board"]);
    expect(unregistered).toEqual([
      {
        pluginId: "conversation-memory",
        workspaceId: "conversation-memory:board",
      },
    ]);
  });

  it("brings blocked action items to the Inbox", async () => {
    await harness.installPlugin(plugin);
    const inbox = harness.getMockShell().getInboxRegistry();
    inbox.finalize();

    expect(inbox.getSource("action-items")?.displayName).toBe("Action items");
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
