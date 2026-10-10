import { describe, expect, it } from "bun:test";
import { studioTypeGroup, SYSTEM_TYPE_GROUPS } from "./studio-areas";
import type { EntityTypeInfo, StudioWorkspaceInfo } from "./api";
import { deriveNavigationModel } from "./studio-navigation-model";
import { studioTypeHierarchy } from "../../src/config";

function type(
  entityType: string,
  classification: EntityTypeInfo["classification"] = "content",
): EntityTypeInfo {
  return {
    entityType,
    classification,
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
      types: [type("post"), type(systemType, "system")],
      active: null,
    });

    expect(studioTypeGroup(type("post"))).toBe("Content");
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

  it("lists a contained type only inside its container", () => {
    const model = deriveNavigationModel({
      types: [type("book"), { ...type("book-section"), containedIn: "book" }],
      active: "book-section",
    });
    expect(
      model.primaryTypeGroups.flatMap((group) =>
        group.types.map((info) => info.entityType),
      ),
    ).toEqual(["book"]);
    expect(model.types.map((info) => info.entityType)).toEqual(["book"]);
    expect(model.active).toBe("book");
    expect(model.destination).toBe("book");
    expect(model.currentArea).toBe("library");
  });

  it("classifies custom systems from metadata, not known names or presentation groups", () => {
    const model = deriveNavigationModel({
      types: [type("prompt"), type("custom-machine", "system"), type("topic")],
      active: "custom-machine",
    });
    expect(model.currentArea).toBe("system");
    expect(
      model.primaryTypeGroups.flatMap((group) =>
        group.types.map((info) => info.entityType),
      ),
    ).toEqual(["prompt", "topic"]);
    expect(model.secondaryTypeGroups).toEqual([
      { label: "Other", types: [type("custom-machine", "system")] },
    ]);
    expect(studioTypeGroup(type("site-info"))).toBe("Content");
    expect(studioTypeGroup(type("site-info", "system"))).toBe("Site");
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
