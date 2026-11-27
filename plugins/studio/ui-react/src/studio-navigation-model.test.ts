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
    singularLabel: entityType,
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

function workspace(
  id: string,
  section: StudioWorkspaceInfo["section"],
): StudioWorkspaceInfo {
  return {
    id,
    pluginId: id.split(":")[0] ?? id,
    label: id,
    rendererName: "DeclarativeOperatorWorkspace",
    priority: 1,
    permission: "trusted",
    section,
    entityTypes: [],
  };
}

const systemType = SYSTEM_TYPE_GROUPS[0].types[0];

describe("deriveNavigationModel", () => {
  it("files content types under Library and system types under Brain", () => {
    const model = deriveNavigationModel({
      types: [type("post"), type(systemType, "system")],
      active: null,
    });

    expect(studioTypeGroup(type("post"))).toBe("Content");
    expect(
      model.libraryTypeGroups.flatMap((group) =>
        group.types.map((info) => info.entityType),
      ),
    ).toEqual(["post"]);
    expect(
      model.brainTypeGroups.flatMap((group) =>
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
      model.libraryTypeGroups.flatMap((group) =>
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
    expect(model.currentArea).toBe("brain");
    expect(
      model.libraryTypeGroups.flatMap((group) =>
        group.types.map((info) => info.entityType),
      ),
    ).toEqual(["prompt", "topic"]);
    expect(model.brainTypeGroups).toEqual([
      { label: "Other", types: [type("custom-machine", "system")] },
    ]);
    expect(studioTypeGroup(type("site-info"))).toBe("Content");
    expect(studioTypeGroup(type("site-info", "system"))).toBe("Site");
  });

  it("places each workspace in the section it names", () => {
    const model = deriveNavigationModel({
      types: [type("post")],
      workspaces: [
        workspace("studio:overview", "home"),
        workspace("unified-inbox:inbox", "home"),
        workspace("content-pipeline:publishing", "publish"),
        workspace("site-builder:site", "publish"),
        workspace("linkedin-import:linkedin", "library"),
        workspace("directory-sync:sync", "brain"),
        workspace("admin:administration", "brain"),
        workspace("studio:account", "brain"),
      ],
      active: "post",
    });
    const ids = (list: StudioWorkspaceInfo[]): string[] =>
      list.map((entry) => entry.id);

    expect(model.overviewWorkspace?.id).toBe("studio:overview");
    expect(ids(model.homeWorkspaces)).toEqual(["unified-inbox:inbox"]);
    expect(ids(model.publishWorkspaces)).toEqual([
      "content-pipeline:publishing",
      "site-builder:site",
    ]);
    expect(ids(model.libraryWorkspaces)).toEqual(["linkedin-import:linkedin"]);
    // Account is reached from the account menu, not a section.
    expect(ids(model.brainWorkspaces)).toEqual([
      "directory-sync:sync",
      "admin:administration",
    ]);
  });

  it("has five sections, each available only when it has somewhere to go", () => {
    const model = deriveNavigationModel({
      types: [type("post")],
      workspaces: [workspace("studio:overview", "home")],
      active: "post",
    });
    expect(model.sections.map((section) => section.label)).toEqual([
      "Home",
      "Library",
      "Publish",
      "Chat",
      "Brain",
    ]);
    expect(
      Object.fromEntries(
        model.sections.map((section) => [section.id, section.available]),
      ),
    ).toEqual({
      home: true,
      library: true,
      publish: false,
      chat: false,
      brain: false,
    });
  });

  it("gives a section the attention its pages ask for", () => {
    const model = deriveNavigationModel({
      types: [],
      workspaces: [
        workspace("studio:overview", "home"),
        workspace("unified-inbox:inbox", "home"),
        workspace("content-pipeline:publishing", "publish"),
      ],
      workspaceBadges: {
        "studio:overview": 1,
        "unified-inbox:inbox": 2,
        "content-pipeline:publishing": 0,
      },
      active: null,
    });
    const badge = (id: string): number | undefined =>
      model.sections.find((section) => section.id === id)?.badge;

    expect(badge("home")).toBe(3);
    expect(badge("publish")).toBeUndefined();
  });

  it("is in the section of the open workspace", () => {
    const model = deriveNavigationModel({
      types: [type("post")],
      workspaces: [workspace("content-pipeline:publishing", "publish")],
      active: "post",
      activeWorkspace: "content-pipeline:publishing",
    });
    expect(model.currentArea).toBe("publish");
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

describe("Library's types", () => {
  it("keeps empty types under All types, out of the way", () => {
    const model = deriveNavigationModel({
      types: [
        type("post"),
        { ...type("newsletter"), count: 0 },
        type("note"),
        { ...type("faq"), count: 0 },
      ],
      active: null,
    });
    expect(
      model.libraryTypeGroups.flatMap((group) =>
        group.types.map((info) => info.entityType),
      ),
    ).toEqual(["post", "note"]);
    expect(model.emptyLibraryTypes.map((info) => info.entityType)).toEqual([
      "newsletter",
      "faq",
    ]);
  });

  it("lists an empty type with the others while it is open", () => {
    const model = deriveNavigationModel({
      types: [type("post"), { ...type("newsletter"), count: 0 }],
      active: "newsletter",
    });
    expect(
      model.libraryTypeGroups.flatMap((group) =>
        group.types.map((info) => info.entityType),
      ),
    ).toEqual(["post", "newsletter"]);
    expect(model.emptyLibraryTypes).toEqual([]);
  });

  it("puts the types used most recently first", () => {
    const model = deriveNavigationModel({
      types: [type("post"), type("note"), type("link")],
      active: null,
      recentTypes: ["link", "note"],
    });
    expect(
      model.libraryTypeGroups.flatMap((group) =>
        group.types.map((info) => info.entityType),
      ),
    ).toEqual(["link", "note", "post"]);
  });
});
