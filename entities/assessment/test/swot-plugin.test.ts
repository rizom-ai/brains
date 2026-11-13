import { beforeEach, describe, expect, it, mock } from "bun:test";
import { randomUUID } from "node:crypto";
import {
  DECLARATIVE_DASHBOARD_WIDGET_RENDERER,
  SYSTEM_CHANNELS,
} from "@brains/plugins";
import { createPluginHarness } from "@brains/plugins/test";
import type { Plugin } from "@brains/plugins";
import type { AssessmentConfigInput } from "../src";
import { createAssessmentPlugins } from "./assessment-plugins";
import { z } from "@brains/utils/zod";

/** The fields this test reads off a dashboard widget registration. */
const widgetRegistrationSchema = z.looseObject({
  id: z.string(),
  group: z.string(),
  rendererName: z.string(),
});

/** The swot plugin, as the canonical brain installs it. */
function swotPlugin(config: AssessmentConfigInput = {}): Plugin {
  const [plugin] = createAssessmentPlugins(config);
  if (!plugin) throw new Error("No swot plugin");
  return plugin;
}

describe("the swot plugin", () => {
  let harness: ReturnType<typeof createPluginHarness>;

  beforeEach(() => {
    harness = createPluginHarness({
      dataDir: `/tmp/test-swot-${randomUUID()}`,
    });
  });

  it("registers SWOT as a terminal scheduler-owned projection", async () => {
    const plugin = swotPlugin();
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

  it("registers the AI-backed rule unscheduled when derivation is disabled", async () => {
    const plugin = swotPlugin({ enableSwotDerivation: false });
    const capabilities = await harness.installPlugin(plugin);

    expect(capabilities.projectionRules).toHaveLength(1);
    expect(capabilities.projectionRules?.[0]).toMatchObject({
      id: "swot-derivation",
      sources: [],
    });
  });

  it("registers deriveSwot eval handler", async () => {
    const plugin = swotPlugin();
    const registrations: Array<{ pluginId: string; handlerId: string }> = [];
    const mockShell = harness.getMockShell();

    mockShell.registerEvalHandler = (pluginId, handlerId): void => {
      registrations.push({ pluginId, handlerId });
    };

    await harness.installPlugin(plugin);

    expect(registrations).toEqual([
      { pluginId: "swot", handlerId: "deriveSwot" },
    ]);
  });

  it("registers the standalone SWOT dashboard widget", async () => {
    const plugin = swotPlugin();
    const registrations: Array<{
      id: string;
      group: string;
      rendererName: string;
    }> = [];

    harness.subscribe("dashboard:register-widget", async (message) => {
      const payload = widgetRegistrationSchema.parse(message.payload);
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

    await harness.installPlugin(swotPlugin());
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
