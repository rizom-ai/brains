import { describe, it, expect, beforeEach } from "bun:test";
import { createPluginHarness } from "@brains/plugins/test";
import { WishlistPlugin } from "../src/index";

describe("WishlistPlugin", () => {
  let harness: ReturnType<typeof createPluginHarness>;

  beforeEach(async () => {
    harness = createPluginHarness();
    await harness.installPlugin(new WishlistPlugin());
  });

  describe("dashboard widget", () => {
    it("should register a widget on system:plugins:ready", async () => {
      const registered: unknown[] = [];
      harness.subscribe("dashboard:register-widget", async (msg) => {
        registered.push(msg.payload);
        return { success: true };
      });

      await harness.sendMessage("system:plugins:ready", {});

      expect(registered).toHaveLength(1);
      const widget = registered[0] as Record<string, unknown>;
      expect(widget).toMatchObject({
        id: "top-wishes",
        pluginId: "wishlist",
        title: "Top Wishes",
        section: "secondary",
        rendererName: "ListWidget",
      });
      expect(widget["dataProvider"]).toBeFunction();
    });

    it("should return wishes sorted by requested count", async () => {
      // Add wishes with different request counts
      await harness.executeTool("wishlist_add", {
        title: "Calendar integration",
        description: "Sync events",
      });
      await harness.executeTool("wishlist_add", {
        title: "Email sending",
        description: "Send emails",
      });
      // Request calendar a second time
      await harness.executeTool("wishlist_add", {
        title: "Calendar integration",
        description: "Calendar sync please",
      });

      const registered: unknown[] = [];
      harness.subscribe("dashboard:register-widget", async (msg) => {
        registered.push(msg.payload);
        return { success: true };
      });

      await harness.sendMessage("system:plugins:ready", {});

      const widget = registered[0] as Record<string, unknown>;
      const dataProvider = widget["dataProvider"] as () => Promise<unknown>;
      const data = (await dataProvider()) as {
        items: Array<{
          id: string;
          name: string;
          count: number;
          priority: string;
        }>;
      };

      expect(data.items).toHaveLength(2);
      // Most requested first
      expect(data.items.at(0)?.name).toBe("Calendar integration");
      expect(data.items.at(0)?.count).toBe(2);
      expect(data.items.at(1)?.name).toBe("Email sending");
    });
  });

  describe("plugin instructions", () => {
    it("should provide agent instructions", async () => {
      const harness2 = createPluginHarness();
      const capabilities = await harness2.installPlugin(new WishlistPlugin());

      expect(capabilities.instructions).toBeDefined();
      expect(capabilities.instructions).toContain("wishlist_add");
    });
  });

  describe("wishlist_add", () => {
    it("should create a new wish entity", async () => {
      const result = await harness.executeTool("wishlist_add", {
        title: "Calendar integration",
        description: "Sync events from Google Calendar",
      });

      expect(result.success).toBe(true);
      expect(result.data).toMatchObject({
        id: "calendar-integration",
        existed: false,
        requested: 1,
      });
    });

    it("should increment requested count on duplicate title", async () => {
      await harness.executeTool("wishlist_add", {
        title: "Calendar integration",
        description: "Sync events from Google Calendar",
      });

      const result = await harness.executeTool("wishlist_add", {
        title: "Calendar integration",
        description: "Would love calendar support",
      });

      expect(result.success).toBe(true);
      expect(result.data).toMatchObject({
        id: "calendar-integration",
        existed: true,
        requested: 2,
      });
    });

    it("should accept optional priority and tags", async () => {
      const result = await harness.executeTool("wishlist_add", {
        title: "Email digest",
        description: "Weekly email summary of activity",
        priority: "high",
        tags: ["email", "notifications"],
      });

      expect(result.success).toBe(true);
    });
  });

  describe("wishlist_list", () => {
    it("should return all wishes", async () => {
      await harness.executeTool("wishlist_add", {
        title: "Calendar integration",
        description: "Sync events",
      });
      await harness.executeTool("wishlist_add", {
        title: "Email digest",
        description: "Weekly summary",
      });

      const result = await harness.executeTool("wishlist_list", {});

      expect(result.success).toBe(true);
      const wishes = result.data as Array<Record<string, unknown>>;
      expect(wishes).toHaveLength(2);
    });

    it("should filter by status", async () => {
      await harness.executeTool("wishlist_add", {
        title: "Calendar integration",
        description: "Sync events",
      });

      const result = await harness.executeTool("wishlist_list", {
        status: "planned",
      });

      expect(result.success).toBe(true);
      const wishes = result.data as Array<Record<string, unknown>>;
      expect(wishes).toHaveLength(0);
    });
  });

  describe("wishlist_update", () => {
    it("should update wish status", async () => {
      await harness.executeTool("wishlist_add", {
        title: "Calendar integration",
        description: "Sync events",
      });

      const result = await harness.executeTool("wishlist_update", {
        id: "calendar-integration",
        status: "planned",
      });

      expect(result.success).toBe(true);
    });

    it("should return error for non-existent wish", async () => {
      const result = await harness.executeTool("wishlist_update", {
        id: "does-not-exist",
        status: "planned",
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("not found");
    });
  });
});
