import { describe, it, expect } from "bun:test";
import { PermissionHandler } from "../src/permission-handler";
import type { PluginTool } from "@brains/types";

describe("PermissionHandler", () => {
  const anchorUserId = "@admin:example.org";
  const trustedUsers = ["@trusted1:example.org", "@trusted2:example.org"];

  describe("User Permission Levels", () => {
    it("should identify anchor user correctly", () => {
      const handler = new PermissionHandler(anchorUserId, trustedUsers);
      expect(handler.getUserPermissionLevel(anchorUserId)).toBe("anchor");
      expect(handler.isAnchor(anchorUserId)).toBe(true);
      expect(handler.isTrusted(anchorUserId)).toBe(false);
    });

    it("should identify trusted users correctly", () => {
      const handler = new PermissionHandler(anchorUserId, trustedUsers);
      expect(handler.getUserPermissionLevel("@trusted1:example.org")).toBe(
        "trusted",
      );
      expect(handler.getUserPermissionLevel("@trusted2:example.org")).toBe(
        "trusted",
      );
      expect(handler.isTrusted("@trusted1:example.org")).toBe(true);
      expect(handler.isAnchor("@trusted1:example.org")).toBe(false);
    });

    it("should identify public users correctly", () => {
      const handler = new PermissionHandler(anchorUserId, trustedUsers);
      expect(handler.getUserPermissionLevel("@random:example.org")).toBe(
        "public",
      );
      expect(handler.isAnchor("@random:example.org")).toBe(false);
      expect(handler.isTrusted("@random:example.org")).toBe(false);
    });
  });

  describe("Tool Filtering", () => {
    const mockTools: PluginTool[] = [
      {
        name: "public-tool",
        description: "A public tool",
        inputSchema: {},
        handler: async () => ({}),
        visibility: "public",
      },
      {
        name: "anchor-tool",
        description: "An anchor-only tool",
        inputSchema: {},
        handler: async () => ({}),
        visibility: "anchor",
      },
      {
        name: "default-tool",
        description: "A tool with no visibility set",
        inputSchema: {},
        handler: async () => ({}),
        // No visibility set - should default to anchor
      },
    ];

    it("should give anchor user all tools", () => {
      const handler = new PermissionHandler(anchorUserId, trustedUsers);
      const filtered = handler.filterToolsByPermission(mockTools, anchorUserId);
      expect(filtered).toHaveLength(3);
      expect(filtered.map((t) => t.name)).toEqual([
        "public-tool",
        "anchor-tool",
        "default-tool",
      ]);
    });

    it("should give trusted users only public tools", () => {
      const handler = new PermissionHandler(anchorUserId, trustedUsers);
      const filtered = handler.filterToolsByPermission(
        mockTools,
        "@trusted1:example.org",
      );
      expect(filtered).toHaveLength(1);
      expect(filtered[0]?.name).toBe("public-tool");
    });

    it("should give public users only public tools", () => {
      const handler = new PermissionHandler(anchorUserId, trustedUsers);
      const filtered = handler.filterToolsByPermission(
        mockTools,
        "@random:example.org",
      );
      expect(filtered).toHaveLength(1);
      expect(filtered[0]?.name).toBe("public-tool");
    });
  });

  describe("Permission Checking", () => {
    it("should check permissions correctly", () => {
      const handler = new PermissionHandler(anchorUserId, trustedUsers);

      // Anchor user has all permissions
      expect(handler.hasPermission(anchorUserId, "anchor")).toBe(true);
      expect(handler.hasPermission(anchorUserId, "trusted")).toBe(true);
      expect(handler.hasPermission(anchorUserId, "public")).toBe(true);

      // Trusted user has trusted and public permissions
      expect(handler.hasPermission("@trusted1:example.org", "anchor")).toBe(
        false,
      );
      expect(handler.hasPermission("@trusted1:example.org", "trusted")).toBe(
        true,
      );
      expect(handler.hasPermission("@trusted1:example.org", "public")).toBe(
        true,
      );

      // Public user has only public permissions
      expect(handler.hasPermission("@random:example.org", "anchor")).toBe(
        false,
      );
      expect(handler.hasPermission("@random:example.org", "trusted")).toBe(
        false,
      );
      expect(handler.hasPermission("@random:example.org", "public")).toBe(true);
    });
  });

  describe("Trusted User Management", () => {
    it("should add and remove trusted users", () => {
      const handler = new PermissionHandler(anchorUserId, []);

      // Initially not trusted
      expect(handler.isTrusted("@newuser:example.org")).toBe(false);
      expect(handler.getUserPermissionLevel("@newuser:example.org")).toBe(
        "public",
      );

      // Add as trusted
      handler.addTrustedUser("@newuser:example.org");
      expect(handler.isTrusted("@newuser:example.org")).toBe(true);
      expect(handler.getUserPermissionLevel("@newuser:example.org")).toBe(
        "trusted",
      );
      expect(handler.getTrustedUsers()).toContain("@newuser:example.org");

      // Remove from trusted
      handler.removeTrustedUser("@newuser:example.org");
      expect(handler.isTrusted("@newuser:example.org")).toBe(false);
      expect(handler.getUserPermissionLevel("@newuser:example.org")).toBe(
        "public",
      );
      expect(handler.getTrustedUsers()).not.toContain("@newuser:example.org");
    });

    it("should not allow anchor user to be added as trusted", () => {
      const handler = new PermissionHandler(anchorUserId, []);

      handler.addTrustedUser(anchorUserId);
      expect(handler.getTrustedUsers()).not.toContain(anchorUserId);
      expect(handler.getUserPermissionLevel(anchorUserId)).toBe("anchor");
    });
  });

  describe("Command Permission", () => {
    it("should allow anchor user to use any command", () => {
      const handler = new PermissionHandler(anchorUserId, trustedUsers);

      expect(handler.canUseCommand(anchorUserId, "any-command")).toBe(true);
      expect(handler.canUseCommand(anchorUserId, "dangerous-command")).toBe(
        true,
      );
    });

    it("should allow other users to use commands (for now)", () => {
      const handler = new PermissionHandler(anchorUserId, trustedUsers);

      // Current implementation allows all users to use commands
      // This will be refined in future phases
      expect(
        handler.canUseCommand("@trusted1:example.org", "some-command"),
      ).toBe(true);
      expect(handler.canUseCommand("@random:example.org", "some-command")).toBe(
        true,
      );
    });
  });
});
