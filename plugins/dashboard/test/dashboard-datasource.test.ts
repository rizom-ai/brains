import { describe, it, expect, beforeEach } from "bun:test";
import { createMockLogger } from "@brains/test-utils";
import { DashboardWidgetRegistry } from "../src/widget-registry";
import {
  DashboardDataSource,
  dashboardDataSchema,
} from "../src/dashboard-datasource";
import type { RegisteredWidget } from "../src/widget-registry";
import type { DashboardData } from "../src/dashboard-datasource";

describe("DashboardDataSource", () => {
  let registry: DashboardWidgetRegistry;
  let datasource: DashboardDataSource;
  let mockLogger: ReturnType<typeof createMockLogger>;

  beforeEach(() => {
    mockLogger = createMockLogger();
    registry = new DashboardWidgetRegistry(mockLogger);
    datasource = new DashboardDataSource(registry, mockLogger);
  });

  describe("fetch", () => {
    it("should return empty widgets when registry is empty", async () => {
      const result = await datasource.fetch<DashboardData>(
        {},
        dashboardDataSchema,
        {},
      );

      expect(result.widgets).toEqual({});
      expect(result.buildInfo).toBeDefined();
      expect(result.buildInfo.timestamp).toBeDefined();
      expect(result.buildInfo.version).toBe("1.0.0");
    });

    it("should aggregate data from all widgets", async () => {
      const widget1: RegisteredWidget = {
        id: "stats-widget",
        pluginId: "system",
        title: "Entity Stats",
        section: "primary",
        priority: 10,
        rendererName: "StatsWidget",
        dataProvider: async () => ({ notes: 42, links: 15 }),
      };

      const widget2: RegisteredWidget = {
        id: "jobs-widget",
        pluginId: "system",
        title: "Active Jobs",
        section: "secondary",
        priority: 20,
        rendererName: "ListWidget",
        dataProvider: async () => ({ items: ["job1", "job2"] }),
      };

      registry.register(widget1);
      registry.register(widget2);

      const result = await datasource.fetch<DashboardData>(
        {},
        dashboardDataSchema,
        {},
      );

      expect(Object.keys(result.widgets)).toHaveLength(2);

      const statsWidget = result.widgets["system:stats-widget"];
      const jobsWidget = result.widgets["system:jobs-widget"];
      expect(statsWidget).toBeDefined();
      expect(jobsWidget).toBeDefined();

      if (statsWidget && jobsWidget) {
        expect(statsWidget.widget.title).toBe("Entity Stats");
        expect(statsWidget.data).toEqual({ notes: 42, links: 15 });
        expect(jobsWidget.data).toEqual({ items: ["job1", "job2"] });
      }
    });

    it("should handle errors from data providers gracefully", async () => {
      const goodWidget: RegisteredWidget = {
        id: "good-widget",
        pluginId: "plugin",
        title: "Good Widget",
        section: "primary",
        priority: 10,
        rendererName: "StatsWidget",
        dataProvider: async () => ({ value: 123 }),
      };

      const badWidget: RegisteredWidget = {
        id: "bad-widget",
        pluginId: "plugin",
        title: "Bad Widget",
        section: "primary",
        priority: 20,
        rendererName: "StatsWidget",
        dataProvider: async () => {
          throw new Error("Data fetch failed");
        },
      };

      registry.register(goodWidget);
      registry.register(badWidget);

      const result = await datasource.fetch<DashboardData>(
        {},
        dashboardDataSchema,
        {},
      );

      // Good widget should be in results
      const goodWidgetData = result.widgets["plugin:good-widget"];
      expect(goodWidgetData).toBeDefined();
      if (goodWidgetData) {
        expect(goodWidgetData.data).toEqual({ value: 123 });
      }

      // Bad widget should not be in results (error was caught)
      expect(result.widgets["plugin:bad-widget"]).toBeUndefined();
    });

    it("should return widget metadata with rendererName but without dataProvider", async () => {
      const widget: RegisteredWidget = {
        id: "test-widget",
        pluginId: "test",
        title: "Test",
        description: "A test widget",
        section: "primary",
        priority: 10,
        rendererName: "CustomWidget",
        dataProvider: async () => ({ value: 1 }),
      };

      registry.register(widget);

      const result = await datasource.fetch<DashboardData>(
        {},
        dashboardDataSchema,
        {},
      );
      const widgetData = result.widgets["test:test-widget"];

      expect(widgetData).toBeDefined();
      if (widgetData) {
        expect(widgetData.widget.id).toBe("test-widget");
        expect(widgetData.widget.pluginId).toBe("test");
        expect(widgetData.widget.title).toBe("Test");
        expect(widgetData.widget.description).toBe("A test widget");
        expect(widgetData.widget.section).toBe("primary");
        expect(widgetData.widget.priority).toBe(10);
        expect(widgetData.widget.rendererName).toBe("CustomWidget");
        // dataProvider should not be in the returned metadata
        expect(widgetData.widget).not.toHaveProperty("dataProvider");
      }
    });

    it("should include buildInfo with timestamp and version", async () => {
      const before = new Date();

      const result = await datasource.fetch<DashboardData>(
        {},
        dashboardDataSchema,
        {},
      );

      const after = new Date();
      const timestamp = new Date(result.buildInfo.timestamp);

      expect(timestamp.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(timestamp.getTime()).toBeLessThanOrEqual(after.getTime());
      expect(result.buildInfo.version).toBe("1.0.0");
    });
  });

  describe("metadata", () => {
    it("should have correct id, name, and description", () => {
      expect(datasource.id).toBe("dashboard:dashboard");
      expect(datasource.name).toBe("Dashboard DataSource");
      expect(datasource.description).toBe(
        "Aggregates dashboard widgets from all plugins",
      );
    });
  });
});
