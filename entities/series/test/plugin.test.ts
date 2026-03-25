import { describe, it, expect, beforeEach } from "bun:test";
import { createPluginHarness } from "@brains/plugins/test";
import { createSilentLogger } from "@brains/test-utils";
import { SeriesPlugin } from "../src/plugin";

describe("SeriesPlugin", () => {
  let harness: ReturnType<typeof createPluginHarness>;

  beforeEach(() => {
    harness = createPluginHarness({
      logger: createSilentLogger("series-plugin-test"),
    });
  });

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

    it("should have derive handler", async () => {
      const plugin = new SeriesPlugin();
      await harness.installPlugin(plugin);

      expect(plugin.hasDeriveHandler()).toBe(true);
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

  describe("derive()", () => {
    it("should create series when source entity has seriesName", async () => {
      const plugin = new SeriesPlugin();
      await harness.installPlugin(plugin);
      const context = harness.getEntityContext("series");

      // Add the source entity with seriesName
      harness.addEntities([
        {
          id: "post-1",
          entityType: "post",
          content: "# Post 1",
          metadata: { title: "Post 1", seriesName: "My Series" },
        },
      ]);

      await plugin.derive(
        {
          id: "post-1",
          entityType: "post",
          content: "# Post 1",
          contentHash: "abc",
          metadata: { title: "Post 1", seriesName: "My Series" },
          created: new Date().toISOString(),
          updated: new Date().toISOString(),
        },
        "created",
        context,
      );

      // Series should be created
      const series = await harness
        .getEntityService()
        .getEntity("series", "my-series");
      expect(series).not.toBeNull();
    });

    it("should sync all series via deriveAll()", async () => {
      const plugin = new SeriesPlugin();
      await harness.installPlugin(plugin);
      const context = harness.getEntityContext("series");

      // Add multiple entities with different series names
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

      await plugin.deriveAll(context);

      const alpha = await harness
        .getEntityService()
        .getEntity("series", "alpha");
      const beta = await harness.getEntityService().getEntity("series", "beta");
      expect(alpha).not.toBeNull();
      expect(beta).not.toBeNull();
    });

    it("should not create series when source has no seriesName", async () => {
      const plugin = new SeriesPlugin();
      await harness.installPlugin(plugin);
      const context = harness.getEntityContext("series");

      await plugin.derive(
        {
          id: "post-2",
          entityType: "post",
          content: "# Post 2",
          contentHash: "def",
          metadata: { title: "Post 2" },
          created: new Date().toISOString(),
          updated: new Date().toISOString(),
        },
        "created",
        context,
      );

      // No series should exist
      const types = harness.getEntityService().getEntityTypes();
      if (types.includes("series")) {
        const entities = await harness
          .getEntityService()
          .listEntities("series");
        expect(entities).toHaveLength(0);
      }
    });
  });

  describe("event subscriptions", () => {
    it("should subscribe to entity:created events", async () => {
      const plugin = new SeriesPlugin();
      await harness.installPlugin(plugin);

      // Add entity with seriesName via event
      harness.addEntities([
        {
          id: "post-3",
          entityType: "post",
          content: "# Post 3",
          metadata: { title: "Post 3", seriesName: "Event Series" },
        },
      ]);

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

      const series = await harness
        .getEntityService()
        .getEntity("series", "event-series");
      expect(series).not.toBeNull();
    });

    it("should work with non-post entity types", async () => {
      const plugin = new SeriesPlugin();
      await harness.installPlugin(plugin);

      harness.addEntities([
        {
          id: "deck-1",
          entityType: "deck",
          content: "# Deck 1",
          metadata: { title: "Deck 1", seriesName: "Deck Series" },
        },
      ]);

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

      const series = await harness
        .getEntityService()
        .getEntity("series", "deck-series");
      expect(series).not.toBeNull();
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
