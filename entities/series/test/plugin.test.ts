import { describe, it, expect, beforeEach, mock } from "bun:test";
import { createPluginHarness } from "@brains/plugins/test";
import { createSilentLogger } from "@brains/test-utils";
import { type JobHandler } from "@brains/plugins";
import { SeriesPlugin } from "../src/plugin";

describe("SeriesPlugin", () => {
  let harness: ReturnType<typeof createPluginHarness>;

  beforeEach(() => {
    harness = createPluginHarness({
      logger: createSilentLogger("series-plugin-test"),
    });
  });

  function captureJobHandlers(): Map<string, JobHandler<string, unknown>> {
    const handlers = new Map<string, JobHandler<string, unknown>>();
    const originalJobQueue = harness.getMockShell().getJobQueueService();
    harness.getMockShell().getJobQueueService =
      (): typeof originalJobQueue => ({
        ...originalJobQueue,
        enqueue: mock(async () => "job-1"),
        registerHandler: (type, handler): void => {
          handlers.set(type, handler);
        },
      });
    return handlers;
  }

  describe("registration", () => {
    it("should register as entity plugin", async () => {
      const plugin = new SeriesPlugin();
      await harness.installPlugin(plugin);

      expect(plugin.type).toBe("entity");
      expect(plugin.id).toBe("series");
    });

    it("should register series entity type", async () => {
      const plugin = new SeriesPlugin();
      await harness.installPlugin(plugin);

      expect(harness.getEntityService().getEntityTypes()).toContain("series");
    });

    it("should return zero tools", async () => {
      const plugin = new SeriesPlugin();
      const capabilities = await harness.installPlugin(plugin);

      expect(capabilities.tools).toHaveLength(0);
    });

    it("should register one scheduler-owned projection rule", async () => {
      const handlers = captureJobHandlers();
      const plugin = new SeriesPlugin();
      const capabilities = await harness.installPlugin(plugin);

      expect(handlers.has("series:project")).toBe(false);
      expect(capabilities.projections).toBeUndefined();
      expect(capabilities.projectionRules).toHaveLength(1);
      expect(capabilities.projectionRules?.[0]).toMatchObject({
        id: "series-projection",
        version: "1",
        sources: [{ kind: "entity", types: ["*"], excludeTypes: ["series"] }],
        targetType: "series",
      });
    });

    it("should register templates including description", async () => {
      const plugin = new SeriesPlugin();
      await harness.installPlugin(plugin);

      const templateNames = Array.from(harness.getTemplates().keys());
      expect(templateNames.some((name) => name.includes("series-list"))).toBe(
        true,
      );
      expect(templateNames.some((name) => name.includes("series-detail"))).toBe(
        true,
      );
      expect(templateNames.some((name) => name.includes("description"))).toBe(
        true,
      );
    });

    it("should register datasource", async () => {
      const plugin = new SeriesPlugin();
      await harness.installPlugin(plugin);

      const datasourceIds = Array.from(harness.getDataSources().keys());
      expect(datasourceIds.some((id) => id.includes("series"))).toBe(true);
    });
  });
});
