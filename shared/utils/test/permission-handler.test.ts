import { describe, expect, test, beforeEach } from "bun:test";
import { PermissionHandler } from "../src/permission-handler";
import type { UserPermissionLevel } from "../src/permission-handler";
import type { PluginTool } from "@brains/plugin-base";

describe("PermissionHandler", () => {
  let permissionHandler: PermissionHandler;
  const anchorUserId = "anchor-user";
  const trustedUsers = ["trusted-user-1", "trusted-user-2"];

  beforeEach(() => {
    permissionHandler = new PermissionHandler(anchorUserId, trustedUsers);
  });

  describe("getUserPermissionLevel", () => {
    test("should return anchor for anchor user", () => {
      expect(permissionHandler.getUserPermissionLevel(anchorUserId)).toBe(
        "anchor",
      );
    });

    test("should return trusted for trusted users", () => {
      expect(permissionHandler.getUserPermissionLevel("trusted-user-1")).toBe(
        "trusted",
      );
      expect(permissionHandler.getUserPermissionLevel("trusted-user-2")).toBe(
        "trusted",
      );
    });

    test("should return public for unknown users", () => {
      expect(permissionHandler.getUserPermissionLevel("unknown-user")).toBe(
        "public",
      );
      expect(permissionHandler.getUserPermissionLevel("random-user")).toBe(
        "public",
      );
    });

    test("should handle empty trusted users list", () => {
      const handler = new PermissionHandler(anchorUserId, []);
      expect(handler.getUserPermissionLevel("some-user")).toBe("public");
      expect(handler.getUserPermissionLevel(anchorUserId)).toBe("anchor");
    });
  });

  describe("canUseTemplate", () => {
    test("should allow everyone to use public templates", () => {
      expect(permissionHandler.canUseTemplate("anchor", "public")).toBe(true);
      expect(permissionHandler.canUseTemplate("trusted", "public")).toBe(true);
      expect(permissionHandler.canUseTemplate("public", "public")).toBe(true);
    });

    test("should allow trusted and anchor to use trusted templates", () => {
      expect(permissionHandler.canUseTemplate("anchor", "trusted")).toBe(true);
      expect(permissionHandler.canUseTemplate("trusted", "trusted")).toBe(true);
      expect(permissionHandler.canUseTemplate("public", "trusted")).toBe(false);
    });

    test("should allow only anchor to use anchor templates", () => {
      expect(permissionHandler.canUseTemplate("anchor", "anchor")).toBe(true);
      expect(permissionHandler.canUseTemplate("trusted", "anchor")).toBe(false);
      expect(permissionHandler.canUseTemplate("public", "anchor")).toBe(false);
    });
  });

  describe("canUseCommand", () => {
    test("should allow anchor user to use all commands", () => {
      expect(permissionHandler.canUseCommand(anchorUserId, "/help")).toBe(true);
      expect(permissionHandler.canUseCommand(anchorUserId, "/admin")).toBe(
        true,
      );
      expect(permissionHandler.canUseCommand(anchorUserId, "/query")).toBe(
        true,
      );
    });

    test("should allow trusted users to use commands", () => {
      expect(permissionHandler.canUseCommand("trusted-user-1", "/help")).toBe(
        true,
      );
      expect(permissionHandler.canUseCommand("trusted-user-1", "/query")).toBe(
        true,
      );
    });

    test("should allow public users to use commands", () => {
      expect(permissionHandler.canUseCommand("unknown-user", "/help")).toBe(
        true,
      );
      expect(permissionHandler.canUseCommand("unknown-user", "/query")).toBe(
        true,
      );
    });
  });

  describe("filterToolsByPermission", () => {
    const mockTools: PluginTool[] = [
      {
        name: "public-tool",
        description: "A public tool",
        inputSchema: {},
        handler: async () => ({}),
        visibility: "public",
      },
      {
        name: "trusted-tool",
        description: "A trusted tool",
        inputSchema: {},
        handler: async () => ({}),
        visibility: "trusted",
      },
      {
        name: "anchor-tool",
        description: "An anchor tool",
        inputSchema: {},
        handler: async () => ({}),
        visibility: "anchor",
      },
      {
        name: "default-tool",
        description: "A tool with default visibility",
        inputSchema: {},
        handler: async () => ({}),
        // No visibility specified - should default to anchor
      },
    ];

    test("should return all tools for anchor permission", () => {
      const filtered = permissionHandler.filterToolsByPermission(
        mockTools,
        "anchor",
      );
      expect(filtered).toHaveLength(4);
      expect(filtered.map((t) => t.name)).toContain("public-tool");
      expect(filtered.map((t) => t.name)).toContain("trusted-tool");
      expect(filtered.map((t) => t.name)).toContain("anchor-tool");
      expect(filtered.map((t) => t.name)).toContain("default-tool");
    });

    test("should return public and trusted tools for trusted permission", () => {
      const filtered = permissionHandler.filterToolsByPermission(
        mockTools,
        "trusted",
      );
      expect(filtered).toHaveLength(2);
      expect(filtered.map((t) => t.name)).toContain("public-tool");
      expect(filtered.map((t) => t.name)).toContain("trusted-tool");
      expect(filtered.map((t) => t.name)).not.toContain("anchor-tool");
      expect(filtered.map((t) => t.name)).not.toContain("default-tool");
    });

    test("should return only public tools for public permission", () => {
      const filtered = permissionHandler.filterToolsByPermission(
        mockTools,
        "public",
      );
      expect(filtered).toHaveLength(1);
      expect(filtered.map((t) => t.name)).toContain("public-tool");
      expect(filtered.map((t) => t.name)).not.toContain("trusted-tool");
      expect(filtered.map((t) => t.name)).not.toContain("anchor-tool");
      expect(filtered.map((t) => t.name)).not.toContain("default-tool");
    });

    test("should handle empty tools array", () => {
      const filtered = permissionHandler.filterToolsByPermission([], "anchor");
      expect(filtered).toHaveLength(0);
    });
  });

  describe("filterToolsByUserId", () => {
    const mockTools: PluginTool[] = [
      {
        name: "public-tool",
        description: "A public tool",
        inputSchema: {},
        handler: async () => ({}),
        visibility: "public",
      },
      {
        name: "trusted-tool",
        description: "A trusted tool",
        inputSchema: {},
        handler: async () => ({}),
        visibility: "trusted",
      },
      {
        name: "anchor-tool",
        description: "An anchor tool",
        inputSchema: {},
        handler: async () => ({}),
        visibility: "anchor",
      },
    ];

    test("should filter tools based on anchor user ID", () => {
      const filtered = permissionHandler.filterToolsByUserId(
        mockTools,
        anchorUserId,
      );
      expect(filtered).toHaveLength(3);
    });

    test("should filter tools based on trusted user ID", () => {
      const filtered = permissionHandler.filterToolsByUserId(
        mockTools,
        "trusted-user-1",
      );
      expect(filtered).toHaveLength(2);
      expect(filtered.map((t) => t.name)).toContain("public-tool");
      expect(filtered.map((t) => t.name)).toContain("trusted-tool");
    });

    test("should filter tools based on public user ID", () => {
      const filtered = permissionHandler.filterToolsByUserId(
        mockTools,
        "unknown-user",
      );
      expect(filtered).toHaveLength(1);
      expect(filtered.map((t) => t.name)).toContain("public-tool");
    });
  });

  describe("hasPermission", () => {
    test("should return true for public permission level for all users", () => {
      expect(permissionHandler.hasPermission(anchorUserId, "public")).toBe(
        true,
      );
      expect(permissionHandler.hasPermission("trusted-user-1", "public")).toBe(
        true,
      );
      expect(permissionHandler.hasPermission("unknown-user", "public")).toBe(
        true,
      );
    });

    test("should return true for trusted permission level for trusted and anchor users", () => {
      expect(permissionHandler.hasPermission(anchorUserId, "trusted")).toBe(
        true,
      );
      expect(permissionHandler.hasPermission("trusted-user-1", "trusted")).toBe(
        true,
      );
      expect(permissionHandler.hasPermission("unknown-user", "trusted")).toBe(
        false,
      );
    });

    test("should return true for anchor permission level only for anchor user", () => {
      expect(permissionHandler.hasPermission(anchorUserId, "anchor")).toBe(
        true,
      );
      expect(permissionHandler.hasPermission("trusted-user-1", "anchor")).toBe(
        false,
      );
      expect(permissionHandler.hasPermission("unknown-user", "anchor")).toBe(
        false,
      );
    });
  });

  describe("trusted user management", () => {
    test("should add trusted users", () => {
      const handler = new PermissionHandler(anchorUserId, []);
      expect(handler.getUserPermissionLevel("new-trusted")).toBe("public");

      handler.addTrustedUser("new-trusted");
      expect(handler.getUserPermissionLevel("new-trusted")).toBe("trusted");
      expect(handler.getTrustedUsers()).toContain("new-trusted");
    });

    test("should not add anchor user as trusted", () => {
      const handler = new PermissionHandler(anchorUserId, []);
      const initialCount = handler.getTrustedUsers().length;

      handler.addTrustedUser(anchorUserId);
      expect(handler.getTrustedUsers()).toHaveLength(initialCount);
      expect(handler.getUserPermissionLevel(anchorUserId)).toBe("anchor");
    });

    test("should remove trusted users", () => {
      expect(permissionHandler.getUserPermissionLevel("trusted-user-1")).toBe(
        "trusted",
      );

      permissionHandler.removeTrustedUser("trusted-user-1");
      expect(permissionHandler.getUserPermissionLevel("trusted-user-1")).toBe(
        "public",
      );
      expect(permissionHandler.getTrustedUsers()).not.toContain(
        "trusted-user-1",
      );
    });

    test("should handle removing non-existent trusted user", () => {
      const initialTrusted = permissionHandler.getTrustedUsers();
      permissionHandler.removeTrustedUser("non-existent");
      expect(permissionHandler.getTrustedUsers()).toEqual(initialTrusted);
    });
  });

  describe("utility methods", () => {
    test("isAnchor should correctly identify anchor user", () => {
      expect(permissionHandler.isAnchor(anchorUserId)).toBe(true);
      expect(permissionHandler.isAnchor("trusted-user-1")).toBe(false);
      expect(permissionHandler.isAnchor("unknown-user")).toBe(false);
    });

    test("isTrusted should correctly identify trusted users", () => {
      expect(permissionHandler.isTrusted(anchorUserId)).toBe(false);
      expect(permissionHandler.isTrusted("trusted-user-1")).toBe(true);
      expect(permissionHandler.isTrusted("trusted-user-2")).toBe(true);
      expect(permissionHandler.isTrusted("unknown-user")).toBe(false);
    });

    test("getTrustedUsers should return all trusted users", () => {
      const trusted = permissionHandler.getTrustedUsers();
      expect(trusted).toHaveLength(2);
      expect(trusted).toContain("trusted-user-1");
      expect(trusted).toContain("trusted-user-2");
    });
  });

  describe("Interface Grant Override Model - getEffectivePermissionLevel", () => {
    test("should use interface permission grant when provided", () => {
      // Interface grants override user permissions
      expect(
        permissionHandler.getEffectivePermissionLevel("unknown-user", "anchor"),
      ).toBe("anchor");
      expect(
        permissionHandler.getEffectivePermissionLevel(
          "unknown-user",
          "trusted",
        ),
      ).toBe("trusted");
      expect(
        permissionHandler.getEffectivePermissionLevel(
          "trusted-user-1",
          "anchor",
        ),
      ).toBe("anchor");
      expect(
        permissionHandler.getEffectivePermissionLevel(anchorUserId, "public"),
      ).toBe("public");
    });

    test("should use user permission level when no interface grant provided", () => {
      expect(permissionHandler.getEffectivePermissionLevel(anchorUserId)).toBe(
        "anchor",
      );
      expect(
        permissionHandler.getEffectivePermissionLevel("trusted-user-1"),
      ).toBe("trusted");
      expect(
        permissionHandler.getEffectivePermissionLevel("unknown-user"),
      ).toBe("public");
    });

    test("should default to public when no userId provided", () => {
      expect(permissionHandler.getEffectivePermissionLevel(null)).toBe(
        "public",
      );
      expect(permissionHandler.getEffectivePermissionLevel(undefined)).toBe(
        "public",
      );
      expect(permissionHandler.getEffectivePermissionLevel("")).toBe("public");
    });

    test("should handle interface grant override edge cases", () => {
      // Interface grant takes precedence even for null/undefined userId
      expect(
        permissionHandler.getEffectivePermissionLevel(null, "anchor"),
      ).toBe("anchor");
      expect(
        permissionHandler.getEffectivePermissionLevel(undefined, "trusted"),
      ).toBe("trusted");
      expect(permissionHandler.getEffectivePermissionLevel("", "anchor")).toBe(
        "anchor",
      );
    });
  });

  describe("Permission Hierarchy Validation", () => {
    const testCases: Array<{
      userLevel: UserPermissionLevel;
      requiredLevel: UserPermissionLevel;
      canUse: boolean;
    }> = [
      // Public level can only access public
      { userLevel: "public", requiredLevel: "public", canUse: true },
      { userLevel: "public", requiredLevel: "trusted", canUse: false },
      { userLevel: "public", requiredLevel: "anchor", canUse: false },

      // Trusted level can access public and trusted
      { userLevel: "trusted", requiredLevel: "public", canUse: true },
      { userLevel: "trusted", requiredLevel: "trusted", canUse: true },
      { userLevel: "trusted", requiredLevel: "anchor", canUse: false },

      // Anchor level can access everything
      { userLevel: "anchor", requiredLevel: "public", canUse: true },
      { userLevel: "anchor", requiredLevel: "trusted", canUse: true },
      { userLevel: "anchor", requiredLevel: "anchor", canUse: true },
    ];

    test.each(testCases)(
      "should correctly evaluate permission hierarchy: $userLevel -> $requiredLevel = $canUse",
      ({ userLevel, requiredLevel, canUse }) => {
        expect(permissionHandler.canUseTemplate(userLevel, requiredLevel)).toBe(
          canUse,
        );

        // Also test hasPermission method for consistency
        const userId =
          userLevel === "anchor"
            ? anchorUserId
            : userLevel === "trusted"
              ? "trusted-user-1"
              : "unknown-user";
        expect(permissionHandler.hasPermission(userId, requiredLevel)).toBe(
          canUse,
        );
      },
    );
  });

  describe("Integration scenarios", () => {
    test("CLI interface anchor grant scenario", () => {
      const unknownUser = "unknown-cli-user";

      // Without interface grant - user has public permissions
      expect(permissionHandler.getEffectivePermissionLevel(unknownUser)).toBe(
        "public",
      );
      expect(permissionHandler.canUseTemplate("public", "anchor")).toBe(false);

      // With CLI interface anchor grant - user gets anchor permissions
      expect(
        permissionHandler.getEffectivePermissionLevel(unknownUser, "anchor"),
      ).toBe("anchor");
      expect(permissionHandler.canUseTemplate("anchor", "anchor")).toBe(true);
    });

    test("Matrix interface user permission scenario", () => {
      const matrixUser = "matrix-user";

      // Matrix interface does not grant permissions - uses actual user permissions
      expect(permissionHandler.getEffectivePermissionLevel(matrixUser)).toBe(
        "public",
      );
      expect(permissionHandler.canUseTemplate("public", "trusted")).toBe(false);

      // Even if we add them as trusted, still no interface override
      permissionHandler.addTrustedUser(matrixUser);
      expect(permissionHandler.getEffectivePermissionLevel(matrixUser)).toBe(
        "trusted",
      );
      expect(permissionHandler.canUseTemplate("trusted", "trusted")).toBe(true);
      expect(permissionHandler.canUseTemplate("trusted", "anchor")).toBe(false);
    });

    test("MCP server anchor grant scenario", () => {
      const mcpUser = "mcp-user";

      // MCP server typically grants anchor permissions
      expect(
        permissionHandler.getEffectivePermissionLevel(mcpUser, "anchor"),
      ).toBe("anchor");
      expect(permissionHandler.canUseTemplate("anchor", "anchor")).toBe(true);
    });
  });

  describe("Static canUseTemplate", () => {
    test("should allow everyone to use public templates", () => {
      expect(PermissionHandler.canUseTemplate("anchor", "public")).toBe(true);
      expect(PermissionHandler.canUseTemplate("trusted", "public")).toBe(true);
      expect(PermissionHandler.canUseTemplate("public", "public")).toBe(true);
    });

    test("should allow trusted and anchor to use trusted templates", () => {
      expect(PermissionHandler.canUseTemplate("anchor", "trusted")).toBe(true);
      expect(PermissionHandler.canUseTemplate("trusted", "trusted")).toBe(true);
      expect(PermissionHandler.canUseTemplate("public", "trusted")).toBe(false);
    });

    test("should allow only anchor to use anchor templates", () => {
      expect(PermissionHandler.canUseTemplate("anchor", "anchor")).toBe(true);
      expect(PermissionHandler.canUseTemplate("trusted", "anchor")).toBe(false);
      expect(PermissionHandler.canUseTemplate("public", "anchor")).toBe(false);
    });
  });
});
