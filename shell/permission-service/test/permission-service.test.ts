import { describe, it, expect, beforeEach } from "bun:test";
import { PermissionService } from "../src/permission-service";
import type {
  PermissionConfig,
  WithVisibility,
} from "../src/permission-service";
import type { UserPermissionLevel } from "@brains/utils";

describe("PermissionService", () => {
  let permissionService: PermissionService;

  describe("Explicit user lists", () => {
    beforeEach(() => {
      const config: PermissionConfig = {
        anchors: ["matrix:@admin:example.org", "cli:admin-user"],
        trusted: ["matrix:@helper:example.org", "discord:helper#1234"],
      };
      permissionService = new PermissionService(config);
    });

    it("should identify anchor users correctly", () => {
      expect(
        permissionService.determineUserLevel("matrix", "@admin:example.org"),
      ).toBe("anchor");
      expect(permissionService.determineUserLevel("cli", "admin-user")).toBe(
        "anchor",
      );
    });

    it("should identify trusted users correctly", () => {
      expect(
        permissionService.determineUserLevel("matrix", "@helper:example.org"),
      ).toBe("trusted");
      expect(
        permissionService.determineUserLevel("discord", "helper#1234"),
      ).toBe("trusted");
    });

    it("should default to public for unknown users", () => {
      expect(
        permissionService.determineUserLevel("matrix", "@random:example.org"),
      ).toBe("public");
      expect(permissionService.determineUserLevel("cli", "random-user")).toBe(
        "public",
      );
    });

    it("should be interface-specific", () => {
      // Same user ID but different interface
      expect(permissionService.determineUserLevel("matrix", "admin-user")).toBe(
        "public",
      );
      expect(
        permissionService.determineUserLevel("discord", "@admin:example.org"),
      ).toBe("public");
    });
  });

  describe("Pattern-based rules", () => {
    beforeEach(() => {
      const config: PermissionConfig = {
        anchors: ["matrix:@owner:example.org"], // Explicit anchor
        rules: [
          { pattern: "cli:*", level: "anchor" }, // All CLI users are anchors
          { pattern: "matrix:@*:admin.org", level: "trusted" }, // Domain-based trust
          { pattern: "discord:*", level: "public" }, // Explicit public (redundant but valid)
        ],
      };
      permissionService = new PermissionService(config);
    });

    it("should apply CLI wildcard rule", () => {
      expect(permissionService.determineUserLevel("cli", "any-user")).toBe(
        "anchor",
      );
      expect(permissionService.determineUserLevel("cli", "another-user")).toBe(
        "anchor",
      );
    });

    it("should apply domain-based rule", () => {
      expect(
        permissionService.determineUserLevel("matrix", "@user1:admin.org"),
      ).toBe("trusted");
      expect(
        permissionService.determineUserLevel("matrix", "@user2:admin.org"),
      ).toBe("trusted");
    });

    it("should prioritize explicit lists over patterns", () => {
      // @owner:example.org is explicitly an anchor, not matched by domain rule
      expect(
        permissionService.determineUserLevel("matrix", "@owner:example.org"),
      ).toBe("anchor");
    });

    it("should apply first matching rule", () => {
      const config: PermissionConfig = {
        rules: [
          { pattern: "test:user*", level: "trusted" },
          { pattern: "test:*", level: "anchor" }, // Would match but comes second
        ],
      };
      const service = new PermissionService(config);

      expect(service.determineUserLevel("test", "user123")).toBe("trusted");
    });

    it("should handle non-matching patterns", () => {
      expect(
        permissionService.determineUserLevel("matrix", "@user:other.org"),
      ).toBe("public");
      expect(permissionService.determineUserLevel("slack", "any-user")).toBe(
        "public",
      );
    });
  });

  describe("Pattern matching", () => {
    beforeEach(() => {
      const config: PermissionConfig = {
        rules: [
          { pattern: "matrix:@*:*.admin.org", level: "trusted" }, // Multi-level wildcard
          { pattern: "cli:admin-*", level: "anchor" }, // Prefix matching
          { pattern: "discord:*#1234", level: "trusted" }, // Suffix matching
          { pattern: "exact:match", level: "anchor" }, // Exact matching
        ],
      };
      permissionService = new PermissionService(config);
    });

    it("should handle multi-level wildcards", () => {
      expect(
        permissionService.determineUserLevel("matrix", "@user:sub.admin.org"),
      ).toBe("trusted");
      expect(
        permissionService.determineUserLevel(
          "matrix",
          "@user:deep.sub.admin.org",
        ),
      ).toBe("trusted");
    });

    it("should handle prefix wildcards", () => {
      expect(permissionService.determineUserLevel("cli", "admin-user1")).toBe(
        "anchor",
      );
      expect(permissionService.determineUserLevel("cli", "admin-user2")).toBe(
        "anchor",
      );
      expect(permissionService.determineUserLevel("cli", "user-admin")).toBe(
        "public",
      );
    });

    it("should handle suffix wildcards", () => {
      expect(
        permissionService.determineUserLevel("discord", "user1#1234"),
      ).toBe("trusted");
      expect(
        permissionService.determineUserLevel("discord", "user2#1234"),
      ).toBe("trusted");
      expect(
        permissionService.determineUserLevel("discord", "user1#5678"),
      ).toBe("public");
    });

    it("should handle exact matches", () => {
      expect(permissionService.determineUserLevel("exact", "match")).toBe(
        "anchor",
      );
      expect(permissionService.determineUserLevel("exact", "no-match")).toBe(
        "public",
      );
    });

    it("should escape regex special characters", () => {
      const config: PermissionConfig = {
        rules: [
          { pattern: "test:user.123", level: "trusted" }, // . should be literal, not wildcard
          { pattern: "test:user+123", level: "anchor" }, // + should be literal
        ],
      };
      const service = new PermissionService(config);

      expect(service.determineUserLevel("test", "user.123")).toBe("trusted");
      expect(service.determineUserLevel("test", "userX123")).toBe("public"); // . is literal
      expect(service.determineUserLevel("test", "user+123")).toBe("anchor");
    });
  });

  describe("Empty configuration", () => {
    beforeEach(() => {
      permissionService = new PermissionService({});
    });

    it("should default to public for all users", () => {
      expect(
        permissionService.determineUserLevel("matrix", "@admin:example.org"),
      ).toBe("public");
      expect(permissionService.determineUserLevel("cli", "admin-user")).toBe(
        "public",
      );
    });
  });

  describe("Complex scenarios", () => {
    beforeEach(() => {
      const config: PermissionConfig = {
        anchors: ["matrix:@superadmin:example.org"],
        trusted: ["cli:trusted-user"],
        rules: [
          { pattern: "cli:*", level: "anchor" }, // This would conflict with trusted user above
          { pattern: "matrix:@*:example.org", level: "trusted" }, // Domain rule
          { pattern: "*:guest*", level: "public" }, // Cross-interface guest pattern
        ],
      };
      permissionService = new PermissionService(config);
    });

    it("should prioritize explicit anchors over rules", () => {
      expect(
        permissionService.determineUserLevel(
          "matrix",
          "@superadmin:example.org",
        ),
      ).toBe("anchor");
    });

    it("should prioritize explicit trusted over rules", () => {
      // trusted-user is explicitly trusted, even though cli:* rule would make it anchor
      expect(permissionService.determineUserLevel("cli", "trusted-user")).toBe(
        "trusted",
      );
    });

    it("should apply domain rule for other matrix users", () => {
      expect(
        permissionService.determineUserLevel("matrix", "@user:example.org"),
      ).toBe("trusted");
    });

    it("should apply CLI rule for other CLI users", () => {
      expect(permissionService.determineUserLevel("cli", "other-user")).toBe(
        "anchor",
      );
    });

    it("should apply cross-interface pattern", () => {
      expect(permissionService.determineUserLevel("matrix", "guest123")).toBe(
        "public",
      );
      expect(permissionService.determineUserLevel("discord", "guest456")).toBe(
        "public",
      );
    });
  });

  describe("Permission checking", () => {
    beforeEach(() => {
      permissionService = new PermissionService({});
    });

    describe("hasPermission method", () => {
      it("should allow everyone access to public content", () => {
        expect(permissionService.hasPermission("public", "public")).toBe(true);
        expect(permissionService.hasPermission("trusted", "public")).toBe(true);
        expect(permissionService.hasPermission("anchor", "public")).toBe(true);
      });

      it("should allow trusted and anchor access to trusted content", () => {
        expect(permissionService.hasPermission("public", "trusted")).toBe(
          false,
        );
        expect(permissionService.hasPermission("trusted", "trusted")).toBe(
          true,
        );
        expect(permissionService.hasPermission("anchor", "trusted")).toBe(true);
      });

      it("should allow only anchor access to anchor content", () => {
        expect(permissionService.hasPermission("public", "anchor")).toBe(false);
        expect(permissionService.hasPermission("trusted", "anchor")).toBe(
          false,
        );
        expect(permissionService.hasPermission("anchor", "anchor")).toBe(true);
      });
    });

    describe("static hasPermission method", () => {
      it("should work identically to instance method", () => {
        const levels: UserPermissionLevel[] = ["public", "trusted", "anchor"];

        for (const userLevel of levels) {
          for (const requiredLevel of levels) {
            expect(
              PermissionService.hasPermission(userLevel, requiredLevel),
            ).toBe(permissionService.hasPermission(userLevel, requiredLevel));
          }
        }
      });
    });
  });

  describe("Filtering", () => {
    beforeEach(() => {
      permissionService = new PermissionService({});
    });

    const createMockItems = (): WithVisibility[] => [
      { visibility: "public" },
      { visibility: "trusted" },
      { visibility: "anchor" },
      { visibility: undefined }, // Should be treated as public
    ];

    describe("filterByPermission", () => {
      it("should return all items for anchor users", () => {
        const items = createMockItems();
        const filtered = permissionService.filterByPermission(items, "anchor");
        expect(filtered).toHaveLength(4);
        expect(filtered).toEqual(items);
      });

      it("should return trusted and public items for trusted users", () => {
        const items = createMockItems();
        const filtered = permissionService.filterByPermission(items, "trusted");
        expect(filtered).toHaveLength(3);
        expect(filtered.map((item) => item.visibility)).toEqual([
          "public",
          "trusted",
          undefined,
        ]);
      });

      it("should return only public items for public users", () => {
        const items = createMockItems();
        const filtered = permissionService.filterByPermission(items, "public");
        expect(filtered).toHaveLength(2);
        expect(filtered.map((item) => item.visibility)).toEqual([
          "public",
          undefined,
        ]);
      });

      it("should handle empty arrays", () => {
        expect(permissionService.filterByPermission([], "anchor")).toEqual([]);
        expect(permissionService.filterByPermission([], "trusted")).toEqual([]);
        expect(permissionService.filterByPermission([], "public")).toEqual([]);
      });

      it("should work with tools (commands with visibility)", () => {
        interface MockCommand extends WithVisibility {
          name: string;
        }

        const commands: MockCommand[] = [
          { name: "help", visibility: "public" },
          { name: "status", visibility: "trusted" },
          { name: "admin", visibility: "anchor" },
          { name: "basic" }, // No visibility = public
        ];

        const publicFiltered = permissionService.filterByPermission(
          commands,
          "public",
        );
        expect(publicFiltered.map((cmd) => cmd.name)).toEqual([
          "help",
          "basic",
        ]);

        const trustedFiltered = permissionService.filterByPermission(
          commands,
          "trusted",
        );
        expect(trustedFiltered.map((cmd) => cmd.name)).toEqual([
          "help",
          "status",
          "basic",
        ]);

        const anchorFiltered = permissionService.filterByPermission(
          commands,
          "anchor",
        );
        expect(anchorFiltered.map((cmd) => cmd.name)).toEqual([
          "help",
          "status",
          "admin",
          "basic",
        ]);
      });
    });
  });
});
