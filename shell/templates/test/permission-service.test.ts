import { describe, it, expect, beforeEach } from "bun:test";
import { hashInterfacePrincipal } from "@brains/contracts";
import {
  PermissionService,
  UserPermissionLevelSchema,
} from "../src/permission-service";
import type {
  PermissionConfig,
  UserPermissionLevel,
  WithVisibility,
} from "../src/permission-service";

describe("PermissionService", () => {
  let permissionService: PermissionService;

  it("keeps admin permission separate from anchor identity", () => {
    expect(UserPermissionLevelSchema.parse("admin")).toBe("admin");
    expect(UserPermissionLevelSchema.safeParse("anchor").success).toBe(false);

    const service = new PermissionService({
      admins: ["cli:admin"],
      anchors: ["cli:owner"],
      rules: [{ pattern: "mcp:*", level: "admin" }],
    });
    expect(service.determineUserLevel("cli", "admin")).toBe("admin");
    expect(service.determineUserLevel("cli", "owner")).toBe("public");
    expect(service.determineUserLevel("mcp", "stdio")).toBe("admin");
    expect(service.isAnchor("cli", "owner")).toBe(true);
    expect(service.isAnchor("cli", "admin")).toBe(false);
  });

  describe("Runtime exact-principal state", () => {
    it("replaces config lists with DB-projected grants and Anchor facets", () => {
      const service = new PermissionService({
        admins: ["discord:config-admin"],
        trusted: ["discord:config-trusted"],
        anchors: ["discord:config-owner"],
        rules: [{ pattern: "slack:team-*", level: "trusted" }],
      });

      service.replaceRuntimePrincipalState({
        grants: [
          {
            interfaceType: "discord",
            principalKeyHash: hashInterfacePrincipal("discord", "db-admin"),
            permissionLevel: "admin",
          },
        ],
        anchors: [
          {
            interfaceType: "discord",
            principalKeyHash: hashInterfacePrincipal("discord", "db-owner"),
          },
        ],
      });

      expect(service.determineUserLevel("discord", "config-admin")).toBe(
        "public",
      );
      expect(service.determineUserLevel("discord", "config-trusted")).toBe(
        "public",
      );
      expect(service.isAnchor("discord", "config-owner")).toBe(false);
      expect(service.determineUserLevel("discord", "db-admin")).toBe("admin");
      expect(service.determineUserLevel("discord", "db-owner")).toBe("public");
      expect(service.isAnchor("discord", "db-owner")).toBe(true);
      expect(service.determineUserLevel("slack", "team-alpha")).toBe("trusted");
    });

    it("returns immutable bootstrap inputs for first initialization", () => {
      const service = new PermissionService({
        admins: ["discord:admin"],
        trusted: ["discord:trusted"],
        anchors: ["discord:owner"],
      });

      const seeds = service.getConfiguredPrincipalSeeds();
      seeds.admins.push("discord:mutated");

      expect(service.getConfiguredPrincipalSeeds()).toEqual({
        admins: ["discord:admin"],
        trusted: ["discord:trusted"],
        anchors: ["discord:owner"],
      });
    });
  });

  describe("Explicit user lists", () => {
    beforeEach(() => {
      const config: PermissionConfig = {
        admins: ["matrix:@admin:example.org", "cli:admin-user"],
        trusted: ["matrix:@helper:example.org", "discord:helper#1234"],
      };
      permissionService = new PermissionService(config);
    });

    it("should identify admin users correctly", () => {
      expect(
        permissionService.determineUserLevel("matrix", "@admin:example.org"),
      ).toBe("admin");
      expect(permissionService.determineUserLevel("cli", "admin-user")).toBe(
        "admin",
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
        admins: ["matrix:@owner:example.org"], // Explicit admin
        rules: [
          { pattern: "cli:*", level: "admin" }, // All CLI users are Admins
          { pattern: "matrix:@*:admin.org", level: "trusted" }, // Domain-based trust
          { pattern: "discord:*", level: "public" }, // Explicit public (redundant but valid)
        ],
      };
      permissionService = new PermissionService(config);
    });

    it("should apply CLI wildcard rule", () => {
      expect(permissionService.determineUserLevel("cli", "any-user")).toBe(
        "admin",
      );
      expect(permissionService.determineUserLevel("cli", "another-user")).toBe(
        "admin",
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
      // @owner:example.org is explicitly an Admin, not matched by domain rule
      expect(
        permissionService.determineUserLevel("matrix", "@owner:example.org"),
      ).toBe("admin");
    });

    it("should apply first matching rule", () => {
      const config: PermissionConfig = {
        rules: [
          { pattern: "test:user*", level: "trusted" },
          { pattern: "test:*", level: "admin" }, // Would match but comes second
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
          { pattern: "cli:admin-*", level: "admin" }, // Prefix matching
          { pattern: "discord:*#1234", level: "trusted" }, // Suffix matching
          { pattern: "exact:match", level: "admin" }, // Exact matching
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
        "admin",
      );
      expect(permissionService.determineUserLevel("cli", "admin-user2")).toBe(
        "admin",
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
        "admin",
      );
      expect(permissionService.determineUserLevel("exact", "no-match")).toBe(
        "public",
      );
    });

    it("should escape regex special characters", () => {
      const config: PermissionConfig = {
        rules: [
          { pattern: "test:user.123", level: "trusted" }, // . should be literal, not wildcard
          { pattern: "test:user+123", level: "admin" }, // + should be literal
        ],
      };
      const service = new PermissionService(config);

      expect(service.determineUserLevel("test", "user.123")).toBe("trusted");
      expect(service.determineUserLevel("test", "userX123")).toBe("public"); // . is literal
      expect(service.determineUserLevel("test", "user+123")).toBe("admin");
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
        admins: ["matrix:@superadmin:example.org"],
        trusted: ["cli:trusted-user"],
        rules: [
          { pattern: "cli:*", level: "admin" }, // This would conflict with trusted user above
          { pattern: "matrix:@*:example.org", level: "trusted" }, // Domain rule
          { pattern: "*:guest*", level: "public" }, // Cross-interface guest pattern
        ],
      };
      permissionService = new PermissionService(config);
    });

    it("should prioritize explicit Admins over rules", () => {
      expect(
        permissionService.determineUserLevel(
          "matrix",
          "@superadmin:example.org",
        ),
      ).toBe("admin");
    });

    it("should prioritize explicit trusted over rules", () => {
      // trusted-user is explicitly trusted, even though cli:* would grant Admin permission
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
        "admin",
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

  describe("Shared spaces", () => {
    const makeService = (
      spaces: string[],
      config: PermissionConfig = {},
    ): PermissionService => new PermissionService(config, { spaces });

    it("should grant trusted access for exact configured spaces", () => {
      const service = makeService(["discord:123"]);

      expect(
        service.determineUserLevel("discord", "user-1", { channelId: "123" }),
      ).toBe("trusted");
    });

    it("should grant trusted access for wildcard configured spaces", () => {
      const service = makeService(["discord:project-*"]);

      expect(
        service.determineUserLevel("discord", "user-1", {
          channelId: "project-alpha",
        }),
      ).toBe("trusted");
      expect(
        service.determineUserLevel("discord", "user-1", {
          channelId: "random",
        }),
      ).toBe("public");
    });

    it("should not grant trusted access without matching context", () => {
      const service = makeService(["discord:123"]);

      expect(service.determineUserLevel("discord", "user-1")).toBe("public");
      expect(
        service.determineUserLevel("discord", "user-1", { channelId: "456" }),
      ).toBe("public");
    });

    it("should prioritize explicit Admin and trusted users over spaces", () => {
      const service = makeService(["discord:123"], {
        admins: ["discord:owner"],
        trusted: ["discord:helper"],
      });

      expect(
        service.determineUserLevel("discord", "owner", { channelId: "123" }),
      ).toBe("admin");
      expect(
        service.determineUserLevel("discord", "helper", { channelId: "123" }),
      ).toBe("trusted");
    });

    it("should preserve elevated pattern rules over spaces", () => {
      const service = makeService(["discord:123"], {
        rules: [
          { pattern: "discord:admin-*", level: "admin" },
          { pattern: "discord:member-*", level: "trusted" },
        ],
      });

      expect(
        service.determineUserLevel("discord", "admin-1", { channelId: "123" }),
      ).toBe("admin");
      expect(
        service.determineUserLevel("discord", "member-1", { channelId: "123" }),
      ).toBe("trusted");
    });

    it("should allow spaces to raise users matched by public fallback rules", () => {
      const service = makeService(["discord:123"], {
        rules: [{ pattern: "discord:*", level: "public" }],
      });

      expect(
        service.determineUserLevel("discord", "user-1", { channelId: "123" }),
      ).toBe("trusted");
    });

    it("should not grant shared-space trust to bots or guests", () => {
      const service = makeService(["discord:123"]);

      expect(
        service.determineUserLevel("discord", "bot", {
          channelId: "123",
          isBot: true,
        }),
      ).toBe("public");
      expect(
        service.determineUserLevel("discord", "guest", {
          channelId: "123",
          isGuest: true,
        }),
      ).toBe("public");
    });

    it("should keep explicit Admin precedence over isBot/isGuest gating", () => {
      const service = makeService(["discord:123"], {
        admins: ["discord:bot-admin"],
      });

      expect(
        service.determineUserLevel("discord", "bot-admin", {
          channelId: "123",
          isBot: true,
        }),
      ).toBe("admin");
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
        expect(permissionService.hasPermission("admin", "public")).toBe(true);
      });

      it("should allow trusted and admin access to trusted content", () => {
        expect(permissionService.hasPermission("public", "trusted")).toBe(
          false,
        );
        expect(permissionService.hasPermission("trusted", "trusted")).toBe(
          true,
        );
        expect(permissionService.hasPermission("admin", "trusted")).toBe(true);
      });

      it("should allow only Admin access to Admin content", () => {
        expect(permissionService.hasPermission("public", "admin")).toBe(false);
        expect(permissionService.hasPermission("trusted", "admin")).toBe(false);
        expect(permissionService.hasPermission("admin", "admin")).toBe(true);
      });
    });

    describe("static hasPermission method", () => {
      it("should work identically to instance method", () => {
        const levels: UserPermissionLevel[] = ["public", "trusted", "admin"];

        for (const userLevel of levels) {
          for (const requiredLevel of levels) {
            expect(
              PermissionService.hasPermission(userLevel, requiredLevel),
            ).toBe(permissionService.hasPermission(userLevel, requiredLevel));
          }
        }
      });
    });

    describe("entity action policy", () => {
      it("should resolve exact entity action policy before wildcard defaults", () => {
        permissionService = new PermissionService({
          entityActions: {
            "*": {
              create: "trusted",
              update: "trusted",
              delete: "admin",
              extract: "admin",
              publish: "admin",
            },
            summary: { create: "admin", update: "admin" },
          },
        });

        expect(
          permissionService.getRequiredEntityActionLevel("note", "create"),
        ).toBe("trusted");
        expect(
          permissionService.getRequiredEntityActionLevel("summary", "create"),
        ).toBe("admin");
        expect(
          permissionService.getRequiredEntityActionLevel("summary", "delete"),
        ).toBe("admin");
        expect(
          permissionService.getRequiredEntityActionLevel("summary", "extract"),
        ).toBe("admin");
        expect(
          permissionService.getRequiredEntityActionLevel("summary", "publish"),
        ).toBe("admin");
      });

      it("should allow entity actions only when the caller meets the required level", () => {
        permissionService = new PermissionService({
          entityActions: {
            "*": {
              create: "trusted",
              delete: "admin",
              extract: "admin",
              publish: "admin",
            },
            summary: { update: "admin" },
          },
        });

        expect(
          permissionService.canPerformEntityAction("trusted", "note", "create"),
        ).toBe(true);
        expect(
          permissionService.canPerformEntityAction("trusted", "note", "delete"),
        ).toBe(false);
        expect(
          permissionService.canPerformEntityAction(
            "trusted",
            "note",
            "extract",
          ),
        ).toBe(false);
        expect(
          permissionService.canPerformEntityAction(
            "trusted",
            "summary",
            "update",
          ),
        ).toBe(false);
        expect(
          permissionService.canPerformEntityAction(
            "trusted",
            "summary",
            "publish",
          ),
        ).toBe(false);
        expect(
          permissionService.canPerformEntityAction(
            "admin",
            "summary",
            "update",
          ),
        ).toBe(true);
      });

      it("should treat undefined userLevel as public", () => {
        permissionService = new PermissionService({
          entityActions: {
            "*": { create: "trusted", update: "public" },
          },
        });

        expect(
          permissionService.canPerformEntityAction(undefined, "note", "create"),
        ).toBe(false);
        expect(
          permissionService.canPerformEntityAction(undefined, "note", "update"),
        ).toBe(true);
      });

      it("should allow any action when no policy is configured", () => {
        permissionService = new PermissionService({});

        expect(
          permissionService.canPerformEntityAction(undefined, "note", "delete"),
        ).toBe(true);
        expect(
          permissionService.canPerformEntityAction("public", "note", "delete"),
        ).toBe(true);
      });

      it("should forbid actions marked never for every caller", () => {
        permissionService = new PermissionService({
          entityActions: {
            "anchor-profile": {
              create: "admin",
              update: "admin",
              delete: "never",
            },
          },
        });

        expect(
          permissionService.canPerformEntityAction(
            "admin",
            "anchor-profile",
            "delete",
          ),
        ).toBe(false);
        expect(
          permissionService.canPerformEntityAction(
            "trusted",
            "anchor-profile",
            "delete",
          ),
        ).toBe(false);
        expect(
          permissionService.canPerformEntityAction(
            undefined,
            "anchor-profile",
            "delete",
          ),
        ).toBe(false);
        // unrelated actions still resolve normally
        expect(
          permissionService.canPerformEntityAction(
            "admin",
            "anchor-profile",
            "update",
          ),
        ).toBe(true);
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
      { visibility: "admin" },
      {}, // No visibility = treated as public
    ];

    describe("filterByPermission", () => {
      it("should return all items for admin users", () => {
        const items = createMockItems();
        const filtered = permissionService.filterByPermission(items, "admin");
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
        expect(permissionService.filterByPermission([], "admin")).toEqual([]);
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
          { name: "admin", visibility: "admin" },
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

        const adminFiltered = permissionService.filterByPermission(
          commands,
          "admin",
        );
        expect(adminFiltered.map((cmd) => cmd.name)).toEqual([
          "help",
          "status",
          "admin",
          "basic",
        ]);
      });
    });
  });

  describe("Entity action policy", () => {
    it("returns undefined when no entity action policy is configured", () => {
      const service = new PermissionService({});

      expect(service.getResolvedEntityActionPolicy("note")).toBeUndefined();
      expect(
        service.getEntityActionRequiredLevel("note", "create"),
      ).toBeUndefined();
    });

    it("merges entity-specific entries over wildcard defaults", () => {
      const service = new PermissionService({
        entityActions: {
          "*": {
            create: "trusted",
            update: "trusted",
            delete: "admin",
            extract: "admin",
            publish: "admin",
          },
          summary: { create: "admin" },
        },
      });

      expect(service.getResolvedEntityActionPolicy("note")).toEqual({
        create: "trusted",
        update: "trusted",
        delete: "admin",
        extract: "admin",
        publish: "admin",
      });
      expect(service.getResolvedEntityActionPolicy("summary")).toEqual({
        create: "admin",
        update: "trusted",
        delete: "admin",
        extract: "admin",
        publish: "admin",
      });
    });

    it("allows callers meeting the required entity action level", () => {
      const service = new PermissionService({
        entityActions: {
          "*": {
            create: "trusted",
            update: "trusted",
            delete: "admin",
            extract: "admin",
            publish: "admin",
          },
        },
      });

      expect(() =>
        service.assertEntityActionAllowed("note", "create", "trusted"),
      ).not.toThrow();
      expect(() =>
        service.assertEntityActionAllowed("note", "delete", "admin"),
      ).not.toThrow();
      expect(() =>
        service.assertEntityActionAllowed("note", "extract", "admin"),
      ).not.toThrow();
      expect(() =>
        service.assertEntityActionAllowed("note", "publish", "admin"),
      ).not.toThrow();
    });

    it("throws a denial message with action, type, caller, and required level", () => {
      const service = new PermissionService({
        entityActions: {
          summary: { update: "admin", extract: "admin", publish: "admin" },
        },
      });

      expect(() =>
        service.assertEntityActionAllowed("summary", "update", "trusted"),
      ).toThrow(
        "Updating `summary` requires Admin permission; your current permission is Trusted.",
      );
      expect(() =>
        service.assertEntityActionAllowed("summary", "extract", "trusted"),
      ).toThrow(
        "Extracting `summary` requires Admin permission; your current permission is Trusted.",
      );
      expect(() =>
        service.assertEntityActionAllowed("summary", "publish", "trusted"),
      ).toThrow(
        "Publishing `summary` requires Admin permission; your current permission is Trusted.",
      );
    });
  });
});
