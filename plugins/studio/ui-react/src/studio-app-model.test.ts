import { describe, expect, it } from "bun:test";
import type { StudioAppViewProps } from "./app-view-props";
import type { StudioCollectionQuery } from "../../src/collection-query";
import { ApiError, type EntityTypeInfo, type StudioWorkspaceInfo } from "./api";
import { initialEditorWorkflowState, type EditorMode } from "./editor-workflow";
import {
  deriveEditorCapabilities,
  deriveEditorHead,
  deriveListingHead,
  deriveStudioAppModel,
  publicationWorkspaceFor,
} from "./studio-app-model";
import { systemEditorCopy } from "./studio-system-presentation";

function typeInfo(overrides: Partial<EntityTypeInfo> = {}): EntityTypeInfo {
  return {
    entityType: "note",
    classification: "content",
    label: "Notes",
    singularLabel: "Note",
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
    hierarchy: { kind: "folder", nested: true },
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
  it("scopes literal grouping fields to the participating entity type", () => {
    const props = viewProps({
      groupings: {
        items: [
          {
            key: "clients",
            label: "Clients",
            field: "clients",
            types: ["note", "post"],
          },
          {
            key: "projects",
            label: "Projects",
            field: "projects",
            types: ["post"],
          },
        ],
        active: null,
        onSelect: (): void => undefined,
      },
    });
    expect(deriveStudioAppModel(props).groupingFields).toEqual(["clients"]);
    expect(
      deriveStudioAppModel({ ...props, entityType: "post" }).groupingFields,
    ).toEqual(["clients", "projects"]);
    expect(
      deriveStudioAppModel({ ...props, entityType: "image" }).groupingFields,
    ).toEqual([]);
  });

  it("does not show the outgoing editor while entering a grouping", () => {
    const props = viewProps({
      editor: { ...initialEditorWorkflowState, mode: { kind: "create" } },
    });
    expect(deriveStudioAppModel(props).editing).toBe(true);
    expect(
      deriveStudioAppModel({ ...props, groupingView: "Clients" }).editing,
    ).toBe(false);
  });
  it("counts entries in the listing head and leaves filtered counts to the filter bar", () => {
    const plain = deriveStudioAppModel(viewProps({ entityTotal: 3 }));
    const filtered = deriveStudioAppModel(
      viewProps({
        entityTotal: 3,
        collectionQuery: { ...viewProps().collectionQuery, q: "draft" },
      }),
    );

    expect(plain.listingHead.title).toBe("Notes");
    expect(plain.listingHead.metadata?.[0]).toBe("3 entries");
    expect(plain.collectionFiltered).toBe(false);
    expect(filtered.listingHead.metadata).toEqual([]);
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
    expect(model.listingHead.metadata).toContain(
      "1 folder · 3 entries in total",
    );
  });

  it("does not announce an empty level above its folders", () => {
    const model = deriveStudioAppModel(
      viewProps({
        entityTotal: 0,
        folders: [{ path: ["about"], name: "about", descendantCount: 1 }],
      }),
    );

    expect(model.listingHead.metadata).toEqual(["1 folder · 1 entry in total"]);
  });

  it("names hierarchy levels the way the type does", () => {
    const model = deriveStudioAppModel(
      viewProps({
        entityType: "chapters",
        types: [
          typeInfo({
            entityType: "chapters",
            label: "Chapters",
            hierarchy: { kind: "page", nested: true },
          }),
        ],
        folders: [{ path: ["a"], name: "a", descendantCount: 2 }],
      }),
    );

    expect(model.hierarchyKind).toBe("page");
    expect(model.listingHead.metadata).toContain("1 page · 2 entries in total");
  });

  it("only allows creating a flat type at the collection root", () => {
    const flat = typeInfo({
      entityType: "memo",
      label: "Memos",
      hierarchy: { kind: "folder", nested: false },
    });
    const atRoot = deriveStudioAppModel(
      viewProps({ entityType: "memo", types: [flat] }),
    );
    const inFolder = deriveStudioAppModel(
      viewProps({
        entityType: "memo",
        types: [flat],
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

const editingNote: EditorMode = {
  kind: "edit",
  entity: {
    id: "hello",
    entityType: "note",
    frontmatter: { title: "Hello", status: "published" },
    updated: "2026-09-18T00:00:00.000Z",
    created: "2026-09-18T00:00:00.000Z",
    body: "",
    contentHash: "hash-1",
  },
};

function withMode(mode: EditorMode): Pick<StudioAppViewProps, "editor"> {
  return { editor: { ...initialEditorWorkflowState, mode } };
}

describe("deriveEditorCapabilities", () => {
  it("grants nothing without an active type", () => {
    expect(
      deriveEditorCapabilities(
        { ...viewProps(), ...withMode(editingNote) },
        undefined,
      ),
    ).toEqual({
      canCreate: false,
      canEdit: false,
      canDelete: false,
      canPublish: false,
      canAssist: false,
      namedCreate: false,
      fieldIssues: undefined,
      destinationBlocked: false,
    });
  });

  it("follows the type's capabilities while editing", () => {
    const props = { ...viewProps(), ...withMode(editingNote) };
    const assisted = typeInfo({
      capabilities: {
        ...typeInfo().capabilities,
        canPublish: true,
        canAssist: true,
      },
    });
    const readOnly = typeInfo({
      capabilities: {
        ...typeInfo().capabilities,
        canUpdate: false,
        canDelete: false,
        canAssist: true,
      },
    });

    expect(deriveEditorCapabilities(props, assisted)).toMatchObject({
      canEdit: true,
      canDelete: true,
      canPublish: true,
      canAssist: true,
    });
    expect(deriveEditorCapabilities(props, readOnly)).toMatchObject({
      canEdit: false,
      canDelete: false,
      canAssist: false,
    });
  });

  it("refuses creating a flat type inside the folder the create started in", () => {
    const flat = typeInfo({ hierarchy: { kind: "folder", nested: false } });
    const atRoot = deriveEditorCapabilities(
      { ...viewProps(), ...withMode({ kind: "create" }) },
      flat,
    );
    const inFolder = deriveEditorCapabilities(
      { ...viewProps(), ...withMode({ kind: "create", prefix: ["a"] }) },
      flat,
    );

    expect(atRoot).toMatchObject({ canCreate: true, canEdit: true });
    expect(inFolder).toMatchObject({ canCreate: false, canEdit: false });
  });

  it("only blocks a named creation until its destination resolves", () => {
    const named = {
      ...viewProps(),
      ...withMode({ kind: "create", segment: "hello" }),
    };
    const resolved = deriveEditorCapabilities(
      {
        ...named,
        creationDestination: {
          data: {
            idPath: ["hello"],
            entityId: "hello",
            entityLeaf: { start: 0, end: 5 },
            filePath: null,
            fileLeaf: null,
          },
          pending: false,
          error: null,
        },
      },
      typeInfo(),
    );
    const unnamed = deriveEditorCapabilities(
      {
        ...viewProps(),
        ...withMode({ kind: "create" }),
        creationDestination: {
          data: null,
          pending: false,
          error: new ApiError(400, "Bad segment", [
            { path: ["segment"], message: "Taken" },
          ]),
        },
      },
      typeInfo(),
    );

    expect(resolved).toMatchObject({
      namedCreate: true,
      destinationBlocked: false,
      fieldIssues: undefined,
    });
    expect(unnamed).toMatchObject({
      namedCreate: false,
      destinationBlocked: false,
      fieldIssues: undefined,
    });
  });
});

describe("deriveListingHead", () => {
  const plainContext = {
    activeType: typeInfo(),
    hierarchyKind: "folder" as const,
    syncPending: false,
  };
  const query = viewProps().collectionQuery;

  it("counts entries across the collection in the singular and plural", () => {
    expect(
      deriveListingHead({ ...viewProps(), entityTotal: 1 }, plainContext)
        .listingHead.metadata,
    ).toEqual(["1 entry"]);
    expect(
      deriveListingHead(
        {
          ...viewProps(),
          entityTotal: 1,
          collectionQuery: { ...query, visibility: "public" },
        },
        plainContext,
      ),
    ).toMatchObject({
      collectionFiltered: true,
      directFolderCount: false,
      listingHead: { metadata: [] },
    });
  });

  it("counts entries directly inside the open folder", () => {
    const inFolder: StudioCollectionQuery = { ...query, prefix: ["a"] };
    expect(
      deriveListingHead(
        { ...viewProps(), entityTotal: 1, collectionQuery: inFolder },
        plainContext,
      ),
    ).toMatchObject({
      directFolderCount: true,
      listingHead: { metadata: ["1 entry here"] },
    });
    expect(
      deriveListingHead(
        {
          ...viewProps(),
          entityTotal: 2,
          collectionQuery: { ...inFolder, status: "draft" },
        },
        plainContext,
      ).listingHead.metadata,
    ).toEqual([]);
  });

  it("names the scope of a folder listing that is not a direct count", () => {
    expect(
      deriveListingHead(
        {
          ...viewProps(),
          collectionQuery: { ...query, prefix: ["a"], scope: "collection" },
        },
        plainContext,
      ).listingHead.metadata,
    ).toEqual(["0 entries", "Whole collection"]);
    expect(
      deriveListingHead(
        {
          ...viewProps(),
          collectionQuery: { ...query, prefix: ["a"], q: "draft" },
        },
        { ...plainContext, hierarchyKind: "page" },
      ).listingHead.metadata,
    ).toEqual(["In this page"]);
  });

  it("pluralizes sub-levels and flags pending sync", () => {
    const head = deriveListingHead(
      {
        ...viewProps(),
        entityTotal: 2,
        folders: [
          { path: ["a"], name: "a", descendantCount: 3 },
          { path: ["b"], name: "b", descendantCount: 4 },
        ],
      },
      { ...plainContext, hierarchyKind: "page", syncPending: true },
    );

    expect(head.listingHead.metadata).toEqual([
      "2 entries here",
      "2 pages · 9 entries in total",
      "Sync pending",
    ]);
  });

  it("titles the listing after the type, then the requested type, then the library", () => {
    expect(deriveListingHead(viewProps(), plainContext).listingHead.title).toBe(
      "Notes",
    );
    expect(
      deriveListingHead(viewProps({ entityType: "memo" }), {
        ...plainContext,
        activeType: undefined,
      }).listingHead.title,
    ).toBe("memo");
    expect(
      deriveListingHead(viewProps({ entityType: null }), {
        ...plainContext,
        activeType: undefined,
      }).listingHead,
    ).toMatchObject({
      kicker: "Content library",
      title: "Library",
      access: { kind: "permission", label: "Trusted" },
      totals: [],
    });
  });
});

describe("deriveEditorHead", () => {
  const schema = viewProps().schema;
  if (!schema) throw new Error("The fixture has a schema");
  const context = {
    activeType: typeInfo(),
    activeWorkspace: undefined,
    entitySchema: schema,
    systemDesign: undefined,
  };
  const publishable = {
    ...schema,
    fields: [
      {
        name: "status",
        label: "Status",
        widget: "select",
        options: ["draft", "published"],
      },
    ],
  };

  it("titles an edited entity and reports its publication state", () => {
    const head = deriveEditorHead(
      { ...viewProps(), ...withMode(editingNote) },
      { ...context, entitySchema: publishable },
    );

    expect(head).toMatchObject({
      heading: "Hello",
      collectionLabel: "Notes",
      entryLabel: "Note",
      publicationState: "published",
      editorHead: {
        kicker: "Notes",
        title: "Hello",
        metadata: ["Note · published"],
      },
    });
  });

  it("leaves the publication state out for types without one", () => {
    const head = deriveEditorHead(
      { ...viewProps(), ...withMode(editingNote) },
      context,
    );

    expect(head.publicationState).toBeNull();
    expect(head.editorHead.metadata).toEqual([]);
  });

  it("marks a new entry and names it after the collection", () => {
    const head = deriveEditorHead(
      { ...viewProps(), ...withMode({ kind: "create" }) },
      { ...context, entitySchema: publishable },
    );

    expect(head).toMatchObject({
      heading: "New note",
      publicationState: null,
      editorHead: { title: "New note", metadata: ["Note · new"] },
    });
  });

  it.each([
    [
      { entityType: "series", label: "Series", singularLabel: "Series" },
      "New series",
      "Series",
    ],
    [
      { entityType: "faq", label: "FAQs", singularLabel: "FAQ" },
      "New FAQ",
      "FAQ",
    ],
    [
      {
        entityType: "ask-content",
        label: "Ask Content",
        singularLabel: "Ask Content",
      },
      "New ask content",
      "Ask Content",
    ],
  ])("names a new %o entry by its singular label", (type, heading, entry) => {
    const head = deriveEditorHead(
      {
        ...viewProps({ entityType: type.entityType }),
        ...withMode({ kind: "create" }),
      },
      { ...context, activeType: typeInfo(type) },
    );

    expect(head).toMatchObject({ heading, entryLabel: entry });
  });

  it("names a singleton that does not exist yet by its name, not as new", () => {
    const askContent = typeInfo({
      entityType: "ask-content",
      label: "Ask Content",
      singularLabel: "Ask Content",
      isSingleton: true,
    });
    const head = deriveEditorHead(
      {
        ...viewProps({ entityType: "ask-content" }),
        ...withMode({ kind: "create" }),
      },
      {
        ...context,
        activeType: askContent,
        entitySchema: { ...schema, isSingleton: true },
      },
    );

    expect(head.heading).toBe("Ask Content");
  });

  it("names a singleton by its singular label under its area", () => {
    const profile = typeInfo({
      entityType: "anchor-profile",
      classification: "system",
      label: "Profiles",
      singularLabel: "Profile",
      isSingleton: true,
    });
    const head = deriveEditorHead(
      {
        ...viewProps({ entityType: "anchor-profile" }),
        ...withMode(editingNote),
      },
      {
        ...context,
        activeType: profile,
        entitySchema: { ...schema, isSingleton: true },
      },
    );

    expect(head).toMatchObject({
      heading: "Profile",
      collectionLabel: "Profile",
      editorHead: { kicker: "system / singleton", title: "Profile" },
    });
  });

  it("prefers the workspace label and the system title", () => {
    const head = deriveEditorHead(
      {
        ...viewProps({ entityType: "grouping-definitions" }),
        ...withMode(editingNote),
      },
      {
        ...context,
        activeWorkspace: workspaceInfo(),
        systemDesign: systemEditorCopy("grouping-definitions"),
      },
    );

    expect(head).toMatchObject({
      collectionLabel: "Inbox",
      entryLabel: "Inbox",
      editorHead: { kicker: "Inbox", title: "Groupings" },
    });
  });

  it("falls back to the requested type and the studio without type metadata", () => {
    expect(
      deriveEditorHead(viewProps({ entityType: "memo" }), {
        ...context,
        activeType: undefined,
      }),
    ).toMatchObject({
      heading: "memo",
      collectionLabel: "memo",
      editorHead: { title: "memo" },
    });
    expect(
      deriveEditorHead(viewProps({ entityType: null }), {
        ...context,
        activeType: undefined,
      }),
    ).toMatchObject({
      heading: null,
      collectionLabel: "Studio",
      editorHead: { title: "Editor" },
    });
  });
});

describe("publicationWorkspaceFor", () => {
  const traffic = workspaceInfo({
    id: "analytics:traffic",
    pluginId: "analytics",
    entityTypes: ["post"],
  });

  it("finds the workspace the server says publishes the type", () => {
    const publishing = workspaceInfo({
      id: "content-pipeline:publishing",
      pluginId: "content-pipeline",
      entityTypes: ["post"],
      publishesEntityTypes: true,
    });

    expect(publicationWorkspaceFor([traffic, publishing], "post")?.id).toBe(
      "content-pipeline:publishing",
    );
    expect(publicationWorkspaceFor([traffic, publishing], "note")).toBe(
      undefined,
    );
  });

  it("reads the declaration rather than the providing plugin", () => {
    const undeclared = workspaceInfo({
      id: "content-pipeline:publishing",
      pluginId: "content-pipeline",
      entityTypes: ["post"],
    });
    const elsewhere = workspaceInfo({
      id: "newsroom:publishing",
      pluginId: "newsroom",
      entityTypes: ["post"],
      publishesEntityTypes: true,
    });

    expect(publicationWorkspaceFor([undeclared, traffic], "post")).toBe(
      undefined,
    );
    expect(publicationWorkspaceFor([elsewhere], "post")?.id).toBe(
      "newsroom:publishing",
    );
  });
});
