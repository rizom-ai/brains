import { describe, expect, it } from "bun:test";
import { studioTypeGroup, SYSTEM_TYPE_GROUPS } from "./studio-areas";
import type { EntityTypeInfo, StudioWorkspaceInfo } from "./api";
import { deriveNavigationModel } from "./studio-navigation-model";
import { studioTypeHierarchy } from "../../src/config";

function type(entityType: string): EntityTypeInfo {
  return {
    entityType,
    label: entityType,
    isSingleton: false,
    hasBody: true,
    count: 1,
    hierarchy: studioTypeHierarchy(entityType),
    capabilities: {
      canRead: true,
      canCreate: true,
      canUpdate: true,
      canDelete: true,
      canExtract: false,
      canPublish: false,
      canAssist: false,
    },
  };
}

function workspace(id: string): StudioWorkspaceInfo {
  return {
    id,
    pluginId: id.split(":")[0] ?? id,
    label: id,
    rendererName: "DeclarativeOperatorWorkspace",
    priority: 1,
    permission: "trusted",
    entityTypes: [],
  };
}

const systemType = SYSTEM_TYPE_GROUPS[0].types[0];

describe("deriveNavigationModel", () => {
  it("files content types under Library and system types under System", () => {
    const model = deriveNavigationModel({
      types: [type("post"), type(systemType)],
      active: null,
    });

    expect(studioTypeGroup("post")).toBe("Content");
    expect(
      model.primaryTypeGroups.flatMap((group) =>
        group.types.map((info) => info.entityType),
      ),
    ).toEqual(["post"]);
    expect(
      model.secondaryTypeGroups.flatMap((group) =>
        group.types.map((info) => info.entityType),
      ),
    ).toEqual([systemType]);
  });

  it("makes an area available only when it has somewhere to go", () => {
    const model = deriveNavigationModel({
      types: [type("post")],
      workspaces: [workspace("studio:overview")],
      active: "post",
    });
    const available = Object.fromEntries(
      model.areas.map((area) => [area.id, area.available]),
    );

    expect(available).toEqual({
      overview: true,
      chat: false,
      library: true,
      work: false,
      administration: false,
      system: false,
    });
  });

  it("carries a workspace's badge onto its area", () => {
    const model = deriveNavigationModel({
      types: [],
      workspaces: [workspace("studio:overview")],
      workspaceBadges: { "studio:overview": 3 },
      active: null,
    });

    expect(model.areas.find((area) => area.id === "overview")?.badge).toBe(3);
  });

  it("points at the open grouping before any type or workspace", () => {
    const model = deriveNavigationModel({
      types: [type("post")],
      active: "post",
      activeWorkspace: "studio:overview",
      groupings: { items: [], active: "clients", onSelect: () => undefined },
    });

    expect(model.currentArea).toBe("library");
    expect(model.destination).toBe("group:clients");
  });
});
