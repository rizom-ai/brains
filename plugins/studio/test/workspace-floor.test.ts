import { describe, expect, it } from "bun:test";
import type { StudioWorkspaceActor } from "@brains/plugins";
import { StudioWorkspaceRegistry } from "../src/workspace-registry";

function actor(
  permission: "public" | "trusted" | "admin",
): StudioWorkspaceActor {
  return {
    interfaceType: "studio",
    userId: `user-${permission}`,
    actor: { kind: "user", userId: `user-${permission}` },
    userPermissionLevel: permission,
    visibilityScope:
      permission === "public"
        ? "public"
        : permission === "trusted"
          ? "shared"
          : "restricted",
    isAnchor: permission === "admin",
  };
}

interface ProviderCalls {
  access: number;
  entityTypes: number;
  badge: number;
  data: number;
  action: number;
}

function emptyCalls(): ProviderCalls {
  return { access: 0, entityTypes: 0, badge: 0, data: 0, action: 0 };
}

describe("Studio workspace permission floors", () => {
  it("defaults registrations to Trusted and runs the floor before every provider", async () => {
    const registry = new StudioWorkspaceRegistry();
    const calls = emptyCalls();
    const workspace = registry.register({
      id: "default-floor",
      pluginId: "provider",
      label: "Default floor",
      rendererName: "DeclarativeOperatorWorkspace",
      priority: 10,
      entityTypes: async () => {
        calls.entityTypes += 1;
        return ["note"];
      },
      accessHandler: () => {
        calls.access += 1;
        return true;
      },
      badgeProvider: async () => {
        calls.badge += 1;
        return 3;
      },
      dataProvider: async () => {
        calls.data += 1;
        return { visible: true };
      },
      actionHandler: async () => {
        calls.action += 1;
        return { changed: true };
      },
    });
    const publicActor = actor("public");

    expect(workspace.permission).toBe("trusted");
    expect(await workspace.accessHandler(publicActor)).toBeFalse();
    if (typeof workspace.entityTypes !== "function") {
      throw new Error("Expected actor-aware entity types");
    }
    expect(await workspace.entityTypes(publicActor)).toEqual([]);
    expect(await workspace.badgeProvider?.(publicActor)).toBeUndefined();
    expect(workspace.dataProvider(publicActor)).rejects.toThrow(
      "requires trusted permission",
    );
    expect(workspace.actionHandler?.({}, publicActor)).rejects.toThrow(
      "requires trusted permission",
    );
    expect(await registry.listDescriptors(publicActor)).toEqual([]);
    expect(calls).toEqual(emptyCalls());
  });

  it("admits an active Public actor only through an explicit lower floor", async () => {
    const registry = new StudioWorkspaceRegistry();
    const calls = emptyCalls();
    const workspace = registry.register({
      id: "account",
      pluginId: "account-provider",
      label: "Account",
      rendererName: "DeclarativeOperatorWorkspace",
      priority: 10,
      permission: "public",
      entityTypes: async () => {
        calls.entityTypes += 1;
        return [];
      },
      accessHandler: () => {
        calls.access += 1;
        return true;
      },
      badgeProvider: async () => {
        calls.badge += 1;
        return 1;
      },
      dataProvider: async () => {
        calls.data += 1;
        return { account: true };
      },
      actionHandler: async () => {
        calls.action += 1;
        return { saved: true };
      },
    });
    const publicActor = actor("public");

    expect(await workspace.accessHandler(publicActor)).toBeTrue();
    expect(await workspace.dataProvider(publicActor)).toEqual({
      account: true,
    });
    expect(await workspace.actionHandler?.({}, publicActor)).toEqual({
      saved: true,
    });
    expect(await registry.listDescriptors(publicActor)).toEqual([
      {
        id: "account",
        pluginId: "account-provider",
        label: "Account",
        rendererName: "DeclarativeOperatorWorkspace",
        priority: 10,
        entityTypes: [],
        badge: 1,
      },
    ]);
    expect(calls).toEqual({
      access: 2,
      entityTypes: 1,
      badge: 1,
      data: 1,
      action: 1,
    });
  });

  it("applies an explicit Admin floor before a permissive handler", async () => {
    const registry = new StudioWorkspaceRegistry();
    let accessCalls = 0;
    registry.register({
      id: "administration",
      pluginId: "admin-provider",
      label: "Administration",
      rendererName: "DeclarativeOperatorWorkspace",
      priority: 10,
      permission: "admin",
      accessHandler: () => {
        accessCalls += 1;
        return true;
      },
      dataProvider: async () => ({}),
    });

    expect(await registry.listDescriptors(actor("trusted"))).toEqual([]);
    expect(accessCalls).toBe(0);
    expect(await registry.listDescriptors(actor("admin"))).toHaveLength(1);
    expect(accessCalls).toBe(1);
  });
});
