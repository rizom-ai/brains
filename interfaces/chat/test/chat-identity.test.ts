import { describe, it, expect, beforeEach, mock } from "bun:test";
import type { Mock } from "bun:test";
import type { UserPermissionLevel } from "@brains/plugins";
import {
  resolveChatIdentity,
  type ChatIdentityAccess,
} from "../src/chat-identity";

interface ResolveIdentityAccessInput {
  type: string;
  subject: string;
}

type Resolution =
  | {
      state: "resolved";
      principal: {
        userId: string;
        personId: string;
        displayName: string;
        role: "admin" | "trusted" | "public";
        status: "active" | "invited" | "suspended";
        permissionLevel: UserPermissionLevel;
        isAnchor: boolean;
        canonicalId?: string;
      };
    }
  | { state: "denied" }
  | { state: "unbound" };

let resolveIdentityAccess:
  Mock<(input: ResolveIdentityAccessInput) => Promise<Resolution>> | undefined;

/**
 * The lookup under test takes its auth dependency as a parameter, so this is a
 * plain object rather than a replaced module: mock.module is for genuinely
 * external packages, and using it on an internal one made the suites depend on
 * which test file imported the module first.
 */
function identityAccess(): ChatIdentityAccess | undefined {
  return resolveIdentityAccess ? { resolveIdentityAccess } : undefined;
}

function principal(
  overrides: Partial<
    Extract<Resolution, { state: "resolved" }>["principal"]
  > = {},
): Extract<Resolution, { state: "resolved" }>["principal"] {
  return {
    userId: "usr_mira",
    personId: "per_mira",
    displayName: "Mira",
    role: "trusted",
    status: "active",
    permissionLevel: "trusted",
    isAnchor: true,
    ...overrides,
  };
}

function createPermissions(
  level: UserPermissionLevel = "public",
  anchor = false,
): {
  getUserLevel: Mock<() => UserPermissionLevel>;
  isAnchor: Mock<() => boolean>;
} {
  return {
    getUserLevel: mock(() => level),
    isAnchor: mock(() => anchor),
  };
}

describe("resolveChatIdentity", () => {
  beforeEach(() => {
    resolveIdentityAccess = undefined;
  });

  it("uses the linked principal's level, anchor flag, and canonical id", async () => {
    resolveIdentityAccess = mock(async () => ({
      state: "resolved" as const,
      principal: principal({ canonicalId: "user:mira" }),
    }));
    const permissions = createPermissions("public");

    const resolution = await resolveChatIdentity(
      permissions,
      "discord",
      "user-789",
      { channelId: "channel-123" },
      identityAccess(),
    );

    expect(resolveIdentityAccess).toHaveBeenCalledWith({
      type: "discord",
      subject: "user-789",
    });
    expect(resolution.permissionLevel).toBe("trusted");
    expect(resolution.isAnchor).toBe(true);
    expect(resolution.principal?.canonicalId).toBe("user:mira");
    expect(permissions.getUserLevel).not.toHaveBeenCalled();
  });

  it("lets a connected account downgrade a config-granted level", async () => {
    resolveIdentityAccess = mock(async () => ({
      state: "resolved" as const,
      principal: principal({
        userId: "usr_member",
        role: "public",
        permissionLevel: "public",
        isAnchor: false,
      }),
    }));
    const permissions = createPermissions("admin", true);

    const resolution = await resolveChatIdentity(
      permissions,
      "discord",
      "anchor-user",
      { channelId: "channel-123" },
      identityAccess(),
    );

    expect(resolution.permissionLevel).toBe("public");
    expect(resolution.isAnchor).toBe(false);
  });

  it("denies known inactive bindings before the permission-rule fallback", async () => {
    resolveIdentityAccess = mock(async () => ({ state: "denied" as const }));
    const permissions = createPermissions("trusted", true);

    const resolution = await resolveChatIdentity(
      permissions,
      "discord",
      "trusted-user",
      { channelId: "channel-123" },
      identityAccess(),
    );

    expect(resolution.permissionLevel).toBe("public");
    expect(resolution.isAnchor).toBe(false);
    expect(resolution.principal).toBeUndefined();
    expect(permissions.getUserLevel).not.toHaveBeenCalled();
  });

  it("falls back to permission rules for unbound identities", async () => {
    resolveIdentityAccess = mock(async () => ({ state: "unbound" as const }));
    const permissions = createPermissions("trusted", true);

    const resolution = await resolveChatIdentity(
      permissions,
      "discord",
      "trusted-user",
      { channelId: "channel-123" },
      identityAccess(),
    );

    expect(resolution.permissionLevel).toBe("trusted");
    expect(resolution.isAnchor).toBe(true);
    expect(resolution.principal).toBeUndefined();
    expect(permissions.getUserLevel).toHaveBeenCalledWith(
      "discord",
      "trusted-user",
      { channelId: "channel-123" },
    );
  });

  it("falls back to permission rules when no auth service is mounted", async () => {
    const permissions = createPermissions("admin", true);

    const resolution = await resolveChatIdentity(
      permissions,
      "discord",
      "anchor-user",
      { channelId: "channel-123" },
      identityAccess(),
    );

    expect(resolution.permissionLevel).toBe("admin");
    expect(resolution.isAnchor).toBe(true);
  });

  it("never consults auth identities for Slack, which has no bindable claim type", async () => {
    resolveIdentityAccess = mock(async () => ({
      state: "resolved" as const,
      principal: principal(),
    }));
    const permissions = createPermissions("public");

    const resolution = await resolveChatIdentity(
      permissions,
      "slack",
      "U123",
      { channelId: "C123" },
      identityAccess(),
    );

    expect(resolveIdentityAccess).not.toHaveBeenCalled();
    expect(resolution.permissionLevel).toBe("public");
    expect(permissions.getUserLevel).toHaveBeenCalledWith("slack", "U123", {
      channelId: "C123",
    });
  });
});
