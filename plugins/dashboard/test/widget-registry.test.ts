import { describe, it, expect, beforeEach } from "bun:test";
import { createMockLogger } from "@brains/test-utils";
import { DashboardWidgetRegistry } from "../src/widget-registry";
import type { RegisteredWidget } from "../src/widget-registry";

describe("DashboardWidgetRegistry", () => {
  let registry: DashboardWidgetRegistry;
  let mockLogger: ReturnType<typeof createMockLogger>;

  beforeEach(() => {
    mockLogger = createMockLogger();
    registry = new DashboardWidgetRegistry(mockLogger);
  });

  describe("register", () => {
    it("should register a widget", () => {
      const widget: RegisteredWidget = {
        id: "test-widget",
        pluginId: "test-plugin",
        title: "Test Widget",
        section: "primary",
        priority: 10,
        rendererName: "StatsWidget",
        dataProvider: async () => ({ count: 42 }),
      };

      registry.register(widget);

      expect(registry.size).toBe(1);
    });

    it("should store the widget rendererName", () => {
      const widget: RegisteredWidget = {
        id: "test-widget",
        pluginId: "test-plugin",
        title: "Test Widget",
        section: "primary",
        priority: 10,
        rendererName: "ListWidget",
        dataProvider: async () => ({ count: 42 }),
      };

      registry.register(widget);

      expect(registry.size).toBe(1);
      const widgets = registry.list();
      expect(widgets[0]?.rendererName).toBe("ListWidget");
    });

    it("should overwrite widget with same key", () => {
      const widget1: RegisteredWidget = {
        id: "test-widget",
        pluginId: "test-plugin",
        title: "Test Widget 1",
        section: "primary",
        priority: 10,
        rendererName: "StatsWidget",
        dataProvider: async () => ({ count: 1 }),
      };

      const widget2: RegisteredWidget = {
        id: "test-widget",
        pluginId: "test-plugin",
        title: "Test Widget 2",
        section: "primary",
        priority: 20,
        rendererName: "StatsWidget",
        dataProvider: async () => ({ count: 2 }),
      };

      registry.register(widget1);
      registry.register(widget2);

      expect(registry.size).toBe(1);
      const widgets = registry.list();
      expect(widgets).toHaveLength(1);
      if (widgets[0]) {
        expect(widgets[0].title).toBe("Test Widget 2");
      }
    });
  });

  describe("unregister", () => {
    it("should unregister a specific widget", () => {
      const widget: RegisteredWidget = {
        id: "test-widget",
        pluginId: "test-plugin",
        title: "Test Widget",
        section: "primary",
        priority: 10,
        rendererName: "StatsWidget",
        dataProvider: async () => ({}),
      };

      registry.register(widget);
      expect(registry.size).toBe(1);

      registry.unregister("test-plugin", "test-widget");
      expect(registry.size).toBe(0);
    });

    it("should unregister all widgets for a plugin", () => {
      const widget1: RegisteredWidget = {
        id: "widget-1",
        pluginId: "test-plugin",
        title: "Widget 1",
        section: "primary",
        priority: 10,
        rendererName: "StatsWidget",
        dataProvider: async () => ({}),
      };

      const widget2: RegisteredWidget = {
        id: "widget-2",
        pluginId: "test-plugin",
        title: "Widget 2",
        section: "secondary",
        priority: 20,
        rendererName: "ListWidget",
        dataProvider: async () => ({}),
      };

      const widget3: RegisteredWidget = {
        id: "widget-3",
        pluginId: "other-plugin",
        title: "Widget 3",
        section: "sidebar",
        priority: 30,
        rendererName: "CustomWidget",
        dataProvider: async () => ({}),
      };

      registry.register(widget1);
      registry.register(widget2);
      registry.register(widget3);
      expect(registry.size).toBe(3);

      registry.unregister("test-plugin");
      expect(registry.size).toBe(1);

      const remaining = registry.list();
      expect(remaining).toHaveLength(1);
      if (remaining[0]) {
        expect(remaining[0].pluginId).toBe("other-plugin");
      }
    });
  });

  describe("list", () => {
    it("should return all widgets sorted by priority", () => {
      const widgets: RegisteredWidget[] = [
        {
          id: "widget-high",
          pluginId: "plugin-a",
          title: "High Priority",
          section: "primary",
          priority: 50,
          rendererName: "StatsWidget",
          dataProvider: async () => ({}),
        },
        {
          id: "widget-low",
          pluginId: "plugin-b",
          title: "Low Priority",
          section: "primary",
          priority: 10,
          rendererName: "StatsWidget",
          dataProvider: async () => ({}),
        },
        {
          id: "widget-mid",
          pluginId: "plugin-c",
          title: "Mid Priority",
          section: "primary",
          priority: 30,
          rendererName: "StatsWidget",
          dataProvider: async () => ({}),
        },
      ];

      widgets.forEach((w) => registry.register(w));

      const listed = registry.list();
      expect(listed).toHaveLength(3);
      if (listed[0] && listed[1] && listed[2]) {
        expect(listed[0].title).toBe("Low Priority");
        expect(listed[1].title).toBe("Mid Priority");
        expect(listed[2].title).toBe("High Priority");
      }
    });

    it("should filter by section", () => {
      const widgets: RegisteredWidget[] = [
        {
          id: "primary-widget",
          pluginId: "plugin",
          title: "Primary",
          section: "primary",
          priority: 10,
          rendererName: "StatsWidget",
          dataProvider: async () => ({}),
        },
        {
          id: "sidebar-widget",
          pluginId: "plugin",
          title: "Sidebar",
          section: "sidebar",
          priority: 10,
          rendererName: "CustomWidget",
          dataProvider: async () => ({}),
        },
        {
          id: "secondary-widget",
          pluginId: "plugin",
          title: "Secondary",
          section: "secondary",
          priority: 10,
          rendererName: "ListWidget",
          dataProvider: async () => ({}),
        },
      ];

      widgets.forEach((w) => registry.register(w));

      const primary = registry.list("primary");
      expect(primary).toHaveLength(1);
      if (primary[0]) {
        expect(primary[0].title).toBe("Primary");
      }

      const sidebar = registry.list("sidebar");
      expect(sidebar).toHaveLength(1);
      if (sidebar[0]) {
        expect(sidebar[0].title).toBe("Sidebar");
      }
    });
  });
});
