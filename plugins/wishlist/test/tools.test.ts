import { describe, it, expect, beforeEach } from "bun:test";
import {
  createPluginHarness,
  expectSuccess,
  expectError,
} from "@brains/plugins/test";
import { z } from "@brains/utils";
import { WishlistPlugin } from "../src/index";

const wishListItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  status: z.string(),
  priority: z.string(),
  requested: z.number(),
});
const wishListSchema = z.array(wishListItemSchema);

describe("WishlistPlugin", () => {
  let harness: ReturnType<typeof createPluginHarness>;

  beforeEach(async () => {
    harness = createPluginHarness();
    await harness.installPlugin(new WishlistPlugin());
  });

  describe("tool registration", () => {
    it("should register wishlist tools", () => {
      const capabilities = harness.getCapabilities();
      const toolNames = capabilities.tools.map((t) => t.name);
      expect(toolNames).toContain("wishlist_add");
      expect(toolNames).toContain("wishlist_list");
      expect(toolNames).toContain("wishlist_update");
    });

    it("should have correct tool descriptions", () => {
      const capabilities = harness.getCapabilities();
      const addTool = capabilities.tools.find((t) => t.name === "wishlist_add");
      expect(addTool?.description).toBeDefined();
    });

    it("should have correct input schemas", () => {
      const capabilities = harness.getCapabilities();
      const addTool = capabilities.tools.find((t) => t.name === "wishlist_add");
      expect(addTool?.inputSchema).toBeDefined();
      expect(addTool?.inputSchema).toHaveProperty("title");
      expect(addTool?.inputSchema).toHaveProperty("description");
    });
  });

  describe("wishlist_add - input validation", () => {
    it("should require title", async () => {
      const result = await harness.executeTool("wishlist_add", {
        description: "Missing title",
      });
      expectError(result);
    });

    it("should require description", async () => {
      const result = await harness.executeTool("wishlist_add", {
        title: "Missing description",
      });
      expectError(result);
    });

    it("should accept valid input", async () => {
      const result = await harness.executeTool("wishlist_add", {
        title: "Test wish",
        description: "A test wish",
      });
      expectSuccess(result);
    });

    it("should accept optional priority", async () => {
      const result = await harness.executeTool("wishlist_add", {
        title: "Test wish",
        description: "A test wish",
        priority: "high",
      });
      expectSuccess(result);
    });

    it("should accept optional tags", async () => {
      const result = await harness.executeTool("wishlist_add", {
        title: "Test wish",
        description: "A test wish",
        tags: ["feature", "ux"],
      });
      expectSuccess(result);
    });
  });

  describe("wishlist_add", () => {
    it("should create a new wish entity", async () => {
      const result = await harness.executeTool("wishlist_add", {
        title: "Calendar integration",
        description: "Sync events from Google Calendar",
      });
      expectSuccess(result);

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
      expectSuccess(result);

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
      expectSuccess(result);
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
      expectSuccess(result);
      const wishes = wishListSchema.parse(result.data);
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
      expectSuccess(result);
      const wishes = wishListSchema.parse(result.data);
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
      expectSuccess(result);
    });

    it("should return error for non-existent wish", async () => {
      const result = await harness.executeTool("wishlist_update", {
        id: "does-not-exist",
        status: "planned",
      });
      expectError(result);
      expect(result.error).toContain("not found");
    });
  });
});
