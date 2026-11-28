import { describe, expect, it } from "bun:test";
import type { StudioWorkspaceActor } from "@brains/plugins";
import { StudioWorkspaceRegistry } from "../src/workspace-registry";

function actor(permission: "trusted" | "admin"): StudioWorkspaceActor {
  return {
    interfaceType: "studio",
    userId: `user-${permission}`,
    actor: { kind: "user", userId: `user-${permission}` },
    userPermissionLevel: permission,
    visibilityScope: permission === "trusted" ? "shared" : "restricted",
    isAnchor: permission === "admin",
  };
}

function registerWorkspace(
  registry: StudioWorkspaceRegistry,
  id: string,
  permission: "trusted" | "admin",
  attention: () => Promise<
    { id: string; title: string; severity: "warn"; action: { label: string } }[]
  >,
): void {
  registry.register({
    id,
    pluginId: `${id}-plugin`,
    label: id === "inbox" ? "Inbox" : "Administration",
    rendererName: "DeclarativeOperatorWorkspace",
    priority: 10,
    permission,
    accessHandler: () => true,
    dataProvider: async () => ({}),
    attentionProvider: attention,
  });
}

// Home asks every workspace the person may open what needs them.
describe("Studio workspace attention", () => {
  it("lists what needs the person from the workspaces they may open", async () => {
    const registry = new StudioWorkspaceRegistry();
    registerWorkspace(registry, "inbox", "trusted", async () => [
      {
        id: "open",
        title: "2 in your inbox",
        severity: "warn",
        action: { label: "Open inbox" },
      },
    ]);
    registerWorkspace(registry, "admin", "admin", async () => [
      {
        id: "invitations",
        title: "1 invitation waiting",
        severity: "warn",
        action: { label: "Review invitations" },
      },
    ]);

    expect(await registry.listAttention(actor("trusted"))).toEqual([
      {
        workspaceId: "inbox",
        pluginId: "inbox-plugin",
        label: "Inbox",
        items: [
          {
            id: "open",
            title: "2 in your inbox",
            severity: "warn",
            action: { label: "Open inbox" },
          },
        ],
      },
    ]);
    expect(
      (await registry.listAttention(actor("admin"))).map(
        (entry) => entry.workspaceId,
      ),
    ).toEqual(["admin", "inbox"]);
  });

  it("leaves out a source that fails, and keeps the others", async () => {
    const registry = new StudioWorkspaceRegistry();
    registerWorkspace(registry, "inbox", "trusted", async () => {
      throw new Error("inbox unavailable");
    });
    registerWorkspace(registry, "admin", "trusted", async () => [
      {
        id: "invitations",
        title: "1 invitation waiting",
        severity: "warn",
        action: { label: "Review invitations" },
      },
    ]);
    expect(
      (await registry.listAttention(actor("trusted"))).map(
        (entry) => entry.workspaceId,
      ),
    ).toEqual(["admin"]);
  });
});
