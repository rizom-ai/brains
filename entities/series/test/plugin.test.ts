import { describe, it, expect, beforeEach, mock } from "bun:test";
import { createPluginHarness } from "@brains/plugins/test";
import { createSilentLogger } from "@brains/test-utils";
import { type JobHandler } from "@brains/plugins";
import { ProgressReporter } from "@brains/utils";
import { SeriesPlugin } from "../src/plugin";

describe("SeriesPlugin", () => {
  let harness: ReturnType<typeof createPluginHarness>;

  beforeEach(() => {
    harness = createPluginHarness({
      logger: createSilentLogger("series-plugin-test"),
    });
  });

  function useMockJobQueue(): {
    enqueue: ReturnType<typeof mock>;
    handlers: Map<string, JobHandler<string, unknown>>;
  } {
    const enqueue = mock(async () => "job-1");
    const handlers = new Map<string, JobHandler<string, unknown>>();
    const originalJobQueue = harness.getMockShell().getJobQueueService();
    harness.getMockShell().getJobQueueService =
      (): typeof originalJobQueue => ({
        ...originalJobQueue,
        enqueue,
        registerHandler: (type, handler): void => {
          handlers.set(type, handler);
        },
      });
    return { enqueue, handlers };
  }

  async function processSeriesProjection(
    handler: JobHandler<string, unknown>,
    data: unknown,
  ): Promise<unknown> {
    const progress = ProgressReporter.from(async (): Promise<void> => {});
    if (!progress) throw new Error("Failed to create progress reporter");
    return handler.process(data, "test-job", progress);
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

    it("should register explicit projection job", async () => {
      const { handlers } = useMockJobQueue();
      const plugin = new SeriesPlugin();
      await harness.installPlugin(plugin);

      expect(handlers.has("series:project")).toBe(true);
    });

    it("should register templates including description", async () => {
      const plugin = new SeriesPlugin();
      await harness.installPlugin(plugin);

      const templates = harness.getTemplates();
      const templateNames = Array.from(templates.keys());
      expect(templateNames.some((n) => n.includes("series-list"))).toBe(true);
      expect(templateNames.some((n) => n.includes("series-detail"))).toBe(true);
      expect(templateNames.some((n) => n.includes("description"))).toBe(true);
    });

    it("should register datasource", async () => {
      const plugin = new SeriesPlugin();
      await harness.installPlugin(plugin);

      const dataSources = harness.getDataSources();
      const dsIds = Array.from(dataSources.keys());
      expect(dsIds.some((id) => id.includes("series"))).toBe(true);
    });
  });

  describe("projection job", () => {
    it("should create series when source entity has seriesName", async () => {
      const { handlers } = useMockJobQueue();
      const plugin = new SeriesPlugin();
      await harness.installPlugin(plugin);

      harness.addEntities([
        {
          id: "post-1",
          entityType: "post",
          content: "# Post 1",
          metadata: { title: "Post 1", seriesName: "My Series" },
        },
      ]);

      const handler = handlers.get("series:project");
      if (!handler) throw new Error("series projection handler not registered");
      await processSeriesProjection(handler, {
        mode: "source",
        entityId: "post-1",
        entityType: "post",
        seriesName: "My Series",
      });

      const series = await harness.getEntityService().getEntity({
        entityType: "series",
        id: "my-series",
      });
      expect(series).not.toBeNull();
    });

    it("should sync all series", async () => {
      const { handlers } = useMockJobQueue();
      const plugin = new SeriesPlugin();
      await harness.installPlugin(plugin);

      harness.addEntities([
        {
          id: "post-a",
          entityType: "post",
          content: "# Post A",
          metadata: { title: "Post A", seriesName: "Alpha" },
        },
        {
          id: "post-b",
          entityType: "post",
          content: "# Post B",
          metadata: { title: "Post B", seriesName: "Beta" },
        },
      ]);

      const handler = handlers.get("series:project");
      if (!handler) throw new Error("series projection handler not registered");
      await processSeriesProjection(handler, {
        mode: "derive",
        reason: "test",
      });

      const alpha = await harness.getEntityService().getEntity({
        entityType: "series",
        id: "alpha",
      });
      const beta = await harness.getEntityService().getEntity({
        entityType: "series",
        id: "beta",
      });
      expect(alpha).not.toBeNull();
      expect(beta).not.toBeNull();
    });

    it("should cleanup orphaned series when source no longer exists", async () => {
      const { handlers } = useMockJobQueue();
      const plugin = new SeriesPlugin();
      await harness.installPlugin(plugin);

      // Pre-seed a series whose only source has just been deleted.
      harness.addEntities([
        {
          id: "ghost-series",
          entityType: "series",
          content: "# Ghost Series",
          metadata: { title: "Ghost Series", slug: "ghost-series" },
        },
      ]);

      const handler = handlers.get("series:project");
      if (!handler) throw new Error("series projection handler not registered");
      await processSeriesProjection(handler, {
        mode: "source",
        entityId: "removed-post",
        entityType: "post",
        seriesName: "Ghost Series",
      });

      const series = await harness.getEntityService().getEntity({
        entityType: "series",
        id: "ghost-series",
      });
      expect(series).toBeNull();
    });
  });

  describe("event subscriptions", () => {
    it("should queue series projection on entity:created events", async () => {
      const { enqueue } = useMockJobQueue();

      const plugin = new SeriesPlugin();
      await harness.installPlugin(plugin);
      await harness.sendMessage("sync:initial:completed", { success: true });
      enqueue.mockClear();

      await harness.sendMessage("entity:created", {
        entityType: "post",
        entityId: "post-3",
        entity: {
          id: "post-3",
          entityType: "post",
          content: "# Post 3",
          contentHash: "ghi",
          metadata: { title: "Post 3", seriesName: "Event Series" },
          created: new Date().toISOString(),
          updated: new Date().toISOString(),
        },
      });

      expect(enqueue).toHaveBeenCalledWith({
        type: "series:project",
        data: {
          mode: "source",
          entityId: "post-3",
          entityType: "post",
          seriesName: "Event Series",
        },
        options: expect.objectContaining({
          deduplication: "coalesce",
          deduplicationKey: "series-source:post:post-3",
        }),
      });
    });

    it("should queue projection for non-post entity types", async () => {
      const { enqueue } = useMockJobQueue();

      const plugin = new SeriesPlugin();
      await harness.installPlugin(plugin);
      await harness.sendMessage("sync:initial:completed", { success: true });
      enqueue.mockClear();

      await harness.sendMessage("entity:created", {
        entityType: "deck",
        entityId: "deck-1",
        entity: {
          id: "deck-1",
          entityType: "deck",
          content: "# Deck 1",
          contentHash: "jkl",
          metadata: { title: "Deck 1", seriesName: "Deck Series" },
          created: new Date().toISOString(),
          updated: new Date().toISOString(),
        },
      });

      expect(enqueue).toHaveBeenCalledWith({
        type: "series:project",
        data: {
          mode: "source",
          entityId: "deck-1",
          entityType: "deck",
          seriesName: "Deck Series",
        },
        options: expect.objectContaining({
          deduplicationKey: "series-source:deck:deck-1",
        }),
      });
    });

    it("should queue full series projection on initial sync", async () => {
      const { enqueue } = useMockJobQueue();

      const plugin = new SeriesPlugin();
      await harness.installPlugin(plugin);

      await harness.sendMessage("sync:initial:completed", {
        success: true,
      });

      expect(enqueue).toHaveBeenCalledWith({
        type: "series:project",
        data: { mode: "derive", reason: "initial-sync" },
        options: expect.objectContaining({
          deduplication: "coalesce",
          deduplicationKey: "series-sync:initial-sync",
        }),
      });
    });

    it("should not enqueue on delete when prior entity had no seriesName", async () => {
      const { enqueue } = useMockJobQueue();
      const plugin = new SeriesPlugin();
      await harness.installPlugin(plugin);
      await harness.sendMessage("sync:initial:completed", { success: true });
      enqueue.mockClear();

      await harness.sendMessage("entity:deleted", {
        entityType: "post",
        entityId: "post-no-series",
        entity: {
          id: "post-no-series",
          entityType: "post",
          content: "# Post",
          contentHash: "abc",
          metadata: { title: "No Series" },
          created: new Date().toISOString(),
          updated: new Date().toISOString(),
        },
      });

      expect(enqueue).not.toHaveBeenCalled();
    });

    it("should enqueue targeted source job on delete when prior entity had seriesName", async () => {
      const { enqueue } = useMockJobQueue();
      const plugin = new SeriesPlugin();
      await harness.installPlugin(plugin);
      await harness.sendMessage("sync:initial:completed", { success: true });
      enqueue.mockClear();

      await harness.sendMessage("entity:deleted", {
        entityType: "post",
        entityId: "post-removed",
        entity: {
          id: "post-removed",
          entityType: "post",
          content: "# Post",
          contentHash: "def",
          metadata: { title: "Removed", seriesName: "Old Series" },
          created: new Date().toISOString(),
          updated: new Date().toISOString(),
        },
      });

      expect(enqueue).toHaveBeenCalledWith({
        type: "series:project",
        data: {
          mode: "source",
          entityId: "post-removed",
          entityType: "post",
          seriesName: "Old Series",
        },
        options: expect.objectContaining({
          deduplicationKey: "series-source:post:post-removed",
        }),
      });
    });

    it("should ignore events from series entity type", async () => {
      const plugin = new SeriesPlugin();
      await harness.installPlugin(plugin);

      // This should not cause infinite loops
      await harness.sendMessage("entity:created", {
        entityType: "series",
        entityId: "some-series",
        entity: {
          id: "some-series",
          entityType: "series",
          content: "# Series",
          contentHash: "xyz",
          metadata: { title: "Some Series", slug: "some-series" },
          created: new Date().toISOString(),
          updated: new Date().toISOString(),
        },
      });

      // Should not throw or cause issues
      expect(true).toBe(true);
    });
  });
});
