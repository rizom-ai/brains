import { beforeEach, describe, expect, it, mock } from "bun:test";
import { randomUUID } from "node:crypto";
import {
  DECLARATIVE_DASHBOARD_WIDGET_RENDERER,
  SYSTEM_CHANNELS,
} from "@brains/plugins";
import { createPluginHarness } from "@brains/plugins/test";
import {
  bindPluginPackageMetadata,
  instantiatePluginPackageDefinition,
  type Plugin,
} from "@brains/plugins";
import assessmentPackage from "../src";
import packageJson from "../package.json";

function swotEntityPlugin(): Plugin {
  const metadata = { name: packageJson.name, version: packageJson.version };
  bindPluginPackageMetadata(assessmentPackage, metadata);
  const plugin = instantiatePluginPackageDefinition(
    assessmentPackage,
    {},
    metadata,
  )[0];
  if (!plugin) throw new Error("SWOT entity plugin was not created");
  return plugin;
}

describe("assessment package", () => {
  let harness: ReturnType<typeof createPluginHarness>;

  beforeEach(() => {
    harness = createPluginHarness({
      dataDir: `/tmp/test-swot-${randomUUID()}`,
    });
  });

  it("registers SWOT as a terminal scheduler-owned projection", async () => {
    const plugin = swotEntityPlugin();
    const capabilities = await harness.installPlugin(plugin);

    expect(plugin.type).toBe("entity");
    expect(harness.getEntityService().getEntityTypes()).toContain("swot");
    expect(
      harness.getEntityRegistry().getEntityTypeConfig("swot"),
    ).toMatchObject({
      projectionSource: false,
      projectionSourceRole: "excluded",
    });
    expect("projections" in capabilities).toBe(false);
    expect(capabilities.projectionRules).toHaveLength(1);
    expect(capabilities.projectionRules?.[0]).toMatchObject({
      id: "swot-derivation",
      version: "1",
      targetType: "swot",
      sources: [{ kind: "entity", types: ["agent", "skill"] }],
    });
  });

  it("registers deriveSwot eval handler", async () => {
    const plugin = swotEntityPlugin();
    const registrations: Array<{ pluginId: string; handlerId: string }> = [];
    const mockShell = harness.getMockShell();

    mockShell.registerEvalHandler = (pluginId, handlerId): void => {
      registrations.push({ pluginId, handlerId });
    };

    await harness.installPlugin(plugin);

    expect(registrations).toEqual([
      { pluginId: `${packageJson.name}:swot`, handlerId: "deriveSwot" },
    ]);
  });

  it("registers the standalone SWOT dashboard widget", async () => {
    const plugin = swotEntityPlugin();
    const registrations: Array<{
      id: string;
      group: string;
      rendererName: string;
    }> = [];

    harness.subscribe("dashboard:register-widget", async (message) => {
      const payload = message.payload as {
        id: string;
        group: string;
        rendererName: string;
      };
      registrations.push({
        id: payload.id,
        group: payload.group,
        rendererName: payload.rendererName,
      });
      return { success: true };
    });

    await harness.installPlugin(plugin);
    await harness.sendMessage(SYSTEM_CHANNELS.pluginsRegistered, {}, "shell");

    expect(registrations).toEqual([
      {
        id: "swot",
        group: "network",
        rendererName: DECLARATIVE_DASHBOARD_WIDGET_RENDERER,
      },
    ]);
  });

  it("does not register or enqueue an event-driven SWOT job", async () => {
    const enqueue = mock(async () => "job-1");
    const registerHandler = mock(() => {});
    const jobQueue = harness.getMockShell().getJobQueueService();
    harness.getMockShell().getJobQueueService = (): typeof jobQueue => ({
      ...jobQueue,
      enqueue,
      registerHandler,
    });

    await harness.installPlugin(swotEntityPlugin());
    await harness.sendMessage("sync:initial:completed", {}, "directory-sync");
    await harness.sendMessage(
      "entity:updated",
      { entityType: "skill", entityId: "skill-1" },
      "test",
    );

    expect(enqueue).not.toHaveBeenCalled();
    expect(registerHandler).not.toHaveBeenCalledWith(
      "swot:derive",
      expect.anything(),
      expect.anything(),
    );
  });
});
