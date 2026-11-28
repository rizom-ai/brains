import { describe, expect, it } from "bun:test";
import type {
  StudioWorkspaceActor,
  StudioWorkspaceRegistration,
} from "@brains/sdk/internal/service-runtime";
import { StudioWorkspaceRegistry } from "../src/workspace-registry";

function actor(
  level: StudioWorkspaceActor["userPermissionLevel"],
): StudioWorkspaceActor {
  return {
    interfaceType: "studio",
    userId: `usr_${level}`,
    actor: { kind: "user", userId: `usr_${level}` },
    userPermissionLevel: level,
    visibilityScope: level === "admin" ? "restricted" : "shared",
    isAnchor: false,
  };
}

function workspace(
  input: Partial<StudioWorkspaceRegistration> &
    Pick<StudioWorkspaceRegistration, "id" | "label">,
): StudioWorkspaceRegistration {
  return {
    pluginId: "fixture",
    rendererName: "DeclarativeOperatorWorkspace",
    priority: 10,
    permission: "trusted",
    accessHandler: async () => true,
    dataProvider: async () => ({}),
    actionHandler: async () => ({}),
    ...input,
  };
}

// ⌘K lists what a caller may run from any page, by page.
describe("palette actions in Studio", () => {
  const registry = new StudioWorkspaceRegistry();
  registry.register(
    workspace({
      id: "site-builder:site",
      label: "Site",
      paletteActions: [
        {
          name: "build-preview",
          label: "Build preview",
          permission: "trusted",
        },
      ],
    }),
  );
  registry.register(
    workspace({
      id: "directory-sync:sync",
      label: "Content sync",
      permission: "admin",
      paletteActions: [
        { name: "sync-now", label: "Sync now", permission: "admin" },
      ],
    }),
  );
  registry.register(
    workspace({
      id: "fixture:closed",
      label: "Closed",
      accessHandler: async () => false,
      paletteActions: [{ name: "run", label: "Run" }],
    }),
  );

  it("offers a trusted member what their pages and permission allow", async () => {
    expect(await registry.listPaletteActions(actor("trusted"))).toEqual([
      {
        workspaceId: "site-builder:site",
        workspaceLabel: "Site",
        name: "build-preview",
        label: "Build preview",
      },
    ]);
  });

  it("offers an admin the admin's actions too", async () => {
    expect(
      (await registry.listPaletteActions(actor("admin"))).map(
        (action) => action.label,
      ),
    ).toEqual(["Sync now", "Build preview"]);
  });
});
