import { describe, expect, it } from "bun:test";
import type { StudioAppViewProps } from "./app-view-props";
import { ApiError, type EntityTypeInfo, type StudioWorkspaceInfo } from "./api";
import { initialEditorWorkflowState } from "./editor-workflow";
import { deriveStudioAppModel } from "./studio-app-model";

function typeInfo(overrides: Partial<EntityTypeInfo> = {}): EntityTypeInfo {
  return {
    entityType: "note",
    label: "Notes",
    isSingleton: false,
    hasBody: true,
    count: 0,
    capabilities: {
      canRead: true,
      canCreate: true,
      canUpdate: true,
      canDelete: true,
      canExtract: false,
      canPublish: false,
      canAssist: false,
    },
    ...overrides,
  };
}

function workspaceInfo(
  overrides: Partial<StudioWorkspaceInfo> = {},
): StudioWorkspaceInfo {
  return {
    id: "inbox",
    pluginId: "unified-inbox",
    label: "Inbox",
    rendererName: "DeclarativeOperatorWorkspace",
    priority: 1,
    permission: "trusted",
    entityTypes: [],
    ...overrides,
  };
}

function viewProps(
  overrides: Partial<StudioAppViewProps> = {},
): StudioAppViewProps {
  const noop = (): void => undefined;
  return {
    activeWorkspaceId: null,
    types: [typeInfo()],
    workspaces: [],
    workspaceError: null,
    declarativeWorkspaceData: null,
    workspaceQuery: {},
    entityType: "note",
    entities: [],
    folders: [],
    collectionPath: "/studio/note",
    selectFolder: noop,
    creationDestination: { data: null, pending: false, error: null },
    entityOffset: 0,
    entityLimit: 20,
    entityTotal: 0,
    collectionQuery: {
      prefix: null,
      scope: "folder",
      q: "",
      visibility: "all",
      status: "",
      sort: "updated-desc",
      offset: 0,
      limit: 20,
    },
    onCollectionQueryChange: noop,
    entityListLoading: false,
    schema: {
      entityType: "note",
      format: "frontmatter",
      isSingleton: false,
      hasBody: true,
      fields: [],
    },
    editor: initialEditorWorkflowState,
    fieldAssistState: { kind: "idle" },
    bodyMode: "preview",
    mobilePane: "details",
    syncStatus: null,
    baselineCommit: null,
    agentTargets: [],
    deleting: false,
    hasUnsavedChanges: false,
    navigationBlocked: false,
    dispatchEditor: noop,
    setFieldAssistState: noop,
    setBodyMode: noop,
    setMobilePane: noop,
    backToList: noop,
    selectEntityType: noop,
    selectWorkspace: noop,
    changeEntityPage: noop,
    openWorkspaceEntity: noop,
    openWorkspaceLaunch: noop,
    performPublishingAction: async () => ({ success: true }),
    performDeclarativeAction: async () => undefined,
    onWorkspaceQueryChange: noop,
    startCreate: noop,
    openEntity: noop,
    runFieldAssist: noop,
    applyFieldAssist: noop,
    save: noop,
    remove: noop,
    onNavigationReset: noop,
    onNavigationProceed: noop,
    ...overrides,
  };
}

describe("deriveStudioAppModel", () => {
  it("counts entities in the listing head and marks filtered results", () => {
    const plain = deriveStudioAppModel(viewProps({ entityTotal: 3 }));
    const filtered = deriveStudioAppModel(
      viewProps({
        entityTotal: 3,
        collectionQuery: { ...viewProps().collectionQuery, q: "draft" },
      }),
    );

    expect(plain.listingHead.title).toBe("Notes");
    expect(plain.listingHead.metadata?.[0]).toBe("3 entities");
    expect(plain.collectionFiltered).toBe(false);
    expect(filtered.listingHead.metadata?.[0]).toBe("3 matching entities");
    expect(filtered.collectionFiltered).toBe(true);
  });

  it("describes folder totals beneath the current folder", () => {
    const model = deriveStudioAppModel(
      viewProps({
        entityTotal: 1,
        folders: [{ path: ["a"], name: "a", descendantCount: 2 }],
      }),
    );

    expect(model.hierarchyKind).toBe("folder");
    expect(model.listingHead.metadata).toContain("1 folder · 3 in total");
  });

  it("only allows creating notes at the collection root", () => {
    const atRoot = deriveStudioAppModel(viewProps());
    const inFolder = deriveStudioAppModel(
      viewProps({
        collectionQuery: { ...viewProps().collectionQuery, prefix: ["a"] },
      }),
    );
    const postInFolder = deriveStudioAppModel(
      viewProps({
        entityType: "post",
        types: [typeInfo({ entityType: "post", label: "Posts" })],
        collectionQuery: { ...viewProps().collectionQuery, prefix: ["a"] },
      }),
    );

    expect(atRoot.canCreate).toBe(true);
    expect(inFolder.canCreate).toBe(false);
    expect(postInFolder.canCreate).toBe(true);
  });

  it("reports validation issues from a failed save", () => {
    const issues = [{ path: ["title"], message: "Required" }];
    const model = deriveStudioAppModel(
      viewProps({
        editor: {
          ...initialEditorWorkflowState,
          mode: { kind: "create" },
          save: { kind: "error", message: "Invalid", issues },
        },
      }),
    );

    expect(model.fieldIssues).toEqual(issues);
    expect(model.editing).toBe(true);
  });

  it("blocks a named creation while its destination is pending or failed", () => {
    const pending = deriveStudioAppModel(
      viewProps({
        editor: {
          ...initialEditorWorkflowState,
          mode: { kind: "create", segment: "hello" },
        },
        creationDestination: { data: null, pending: true, error: null },
      }),
    );
    const failed = deriveStudioAppModel(
      viewProps({
        editor: {
          ...initialEditorWorkflowState,
          mode: { kind: "create", segment: "hello" },
        },
        creationDestination: {
          data: null,
          pending: false,
          error: new ApiError(400, "Bad segment", [
            { path: ["segment"], message: "Taken" },
          ]),
        },
      }),
    );

    expect(pending.namedCreate).toBe(true);
    expect(pending.destinationBlocked).toBe(true);
    expect(pending.editorHead.metadata).toEqual([
      `${pending.entryLabel} · new`,
    ]);
    expect(failed.destinationBlocked).toBe(true);
    expect(failed.fieldIssues).toEqual([
      { path: ["segment"], message: "Taken" },
    ]);
  });

  it("labels the active workspace and leaves the declarative head empty without data", () => {
    const model = deriveStudioAppModel(
      viewProps({
        activeWorkspaceId: "inbox",
        workspaces: [workspaceInfo({ badge: 4 })],
        entityType: null,
      }),
    );

    expect(model.activeWorkspace?.id).toBe("inbox");
    expect(model.collectionLabel).toBe("Inbox");
    expect(model.editing).toBe(false);
    expect(model.declarativeHead).toBeNull();
    expect(model.workspaceBadges).toEqual({ inbox: 4 });
  });

  it("computes the visible page end from the loaded entities", () => {
    const loaded = deriveStudioAppModel(
      viewProps({
        entityOffset: 20,
        entityLimit: 20,
        entityTotal: 25,
        entities: Array.from({ length: 5 }, (_, index) => ({
          id: `entity-${index}`,
          entityType: "note",
          frontmatter: {},
          updated: "2026-09-18T00:00:00.000Z",
        })),
      }),
    );
    const unloaded = deriveStudioAppModel(
      viewProps({
        entityOffset: 20,
        entityLimit: 20,
        entityTotal: 25,
        entities: null,
      }),
    );

    expect(loaded.pageEnd).toBe(25);
    expect(unloaded.pageEnd).toBe(25);
  });
});
