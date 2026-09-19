/** @jsxImportSource react */
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  type RouterHistory,
} from "@tanstack/react-router";
import { Window } from "happy-dom";
import { act, createElement, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { EntityTypeInfo, StudioWorkspaceInfo } from "./api";
import { studioCollectionQuerySchema } from "../../src/collection-query";
import { createStudioQueryClient } from "./query-client";
import {
  useStudioRouteEffects,
  type StudioRouteEffectsInput,
} from "./use-studio-route-effects";

function typeInfo(overrides: Partial<EntityTypeInfo> = {}): EntityTypeInfo {
  return {
    entityType: "note",
    label: "Notes",
    isSingleton: false,
    hasBody: true,
    count: 1,
    capabilities: {
      canRead: true,
      canCreate: true,
      canUpdate: true,
      canDelete: false,
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

let windowInstance: Window;
let root: Root;

beforeEach(() => {
  windowInstance = new Window({ url: "http://brain.test/studio" });
  Object.assign(globalThis, {
    window: windowInstance,
    document: windowInstance.document,
    navigator: windowInstance.navigator,
    HTMLElement: windowInstance.HTMLElement,
    Element: windowInstance.Element,
    Node: windowInstance.Node,
    IS_REACT_ACT_ENVIRONMENT: true,
  });
  const container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  windowInstance.close();
});

interface Harness {
  history: RouterHistory;
  activeWorkspaceIds: Array<string | null>;
  entityTypes: Array<string | null>;
  loadErrors: Array<string | null>;
  supersedes: number;
}

async function renderEffects(
  overrides: Partial<StudioRouteEffectsInput>,
  initialPath = "/studio",
): Promise<Harness> {
  const history = createMemoryHistory({ initialEntries: [initialPath] });
  const harness: Harness = {
    history,
    activeWorkspaceIds: [],
    entityTypes: [],
    loadErrors: [],
    supersedes: 0,
  };
  const client = createStudioQueryClient();
  function Probe(): ReactElement | null {
    useStudioRouteEffects({
      history,
      queryClient: client,
      studioBasePath: "/studio",
      routeTarget: { kind: "home" },
      routePathname: history.location.pathname,
      routeSearch: "",
      entityType: null,
      activeWorkspaceId: null,
      types: [typeInfo()],
      workspaces: [],
      activeType: undefined,
      activeWorkspace: undefined,
      entityCollectionQuery: studioCollectionQuerySchema.parse({}),
      entityListOffset: 0,
      entityListTotal: undefined,
      declarativeWorkspaceData: null,
      initialUrlWorkspaceQuery: {},
      setActiveWorkspaceId: (update): void => {
        harness.activeWorkspaceIds.push(
          typeof update === "function"
            ? update(harness.activeWorkspaceIds.at(-1) ?? null)
            : update,
        );
      },
      setEntityType: (update): void => {
        harness.entityTypes.push(
          typeof update === "function"
            ? update(harness.entityTypes.at(-1) ?? null)
            : update,
        );
      },
      setLoadError: (update): void => {
        harness.loadErrors.push(
          typeof update === "function"
            ? update(harness.loadErrors.at(-1) ?? null)
            : update,
        );
      },
      supersedeOpen: (): void => {
        harness.supersedes += 1;
      },
      ...overrides,
    });
    return null;
  }
  await act(async () => {
    root.render(
      createElement(QueryClientProvider, { client }, createElement(Probe)),
    );
  });
  return harness;
}

describe("useStudioRouteEffects", () => {
  it("resolves a collection route to its entity type", async () => {
    const harness = await renderEffects({
      routeTarget: { kind: "collection", entityType: "note" },
    });

    expect(harness.entityTypes.at(-1)).toBe("note");
    expect(harness.activeWorkspaceIds.at(-1)).toBeNull();
    expect(harness.loadErrors).toEqual([null]);
  });

  it("resolves a workspace route and clears the entity type", async () => {
    const harness = await renderEffects({
      routeTarget: { kind: "workspace", workspaceId: "inbox" },
      workspaces: [workspaceInfo()],
    });

    expect(harness.activeWorkspaceIds.at(-1)).toBe("inbox");
    expect(harness.entityTypes.at(-1)).toBeNull();
  });

  it("reports a collection this account cannot read and drops the open", async () => {
    const harness = await renderEffects({
      routeTarget: { kind: "collection", entityType: "secret" },
    });

    expect(harness.loadErrors.at(-1)).toBe(
      "Collection unavailable for this account: secret",
    );
    expect(harness.supersedes).toBe(1);
    expect(harness.entityTypes).toEqual([]);
  });

  it("reports a workspace this account cannot open", async () => {
    const harness = await renderEffects({
      routeTarget: { kind: "workspace", workspaceId: "ghost" },
      workspaces: [workspaceInfo()],
    });

    expect(harness.loadErrors.at(-1)).toBe(
      "Workspace unavailable for this account: ghost",
    );
    expect(harness.supersedes).toBe(1);
  });

  it("reports an unparseable route as not found", async () => {
    const harness = await renderEffects({
      routeTarget: { kind: "not-found", pathname: "/studio/nope" },
    });

    expect(harness.loadErrors.at(-1)).toBe(
      "Studio route not found: /studio/nope",
    );
    expect(harness.supersedes).toBe(1);
  });

  it("clamps an offset that is past the end of the collection", async () => {
    const harness = await renderEffects(
      {
        routeTarget: { kind: "collection", entityType: "note" },
        entityType: "note",
        activeType: typeInfo(),
        entityListOffset: 60,
        entityListTotal: 25,
        entityCollectionQuery: studioCollectionQuerySchema.parse({
          offset: 60,
          limit: 20,
        }),
        routePathname: "/studio/entities/note",
      },
      "/studio/entities/note",
    );

    expect(harness.history.location.search).toContain("offset=20");
  });

  it("leaves an in-range offset alone", async () => {
    const harness = await renderEffects(
      {
        routeTarget: { kind: "collection", entityType: "note" },
        entityType: "note",
        activeType: typeInfo(),
        entityListOffset: 20,
        entityListTotal: 25,
        entityCollectionQuery: studioCollectionQuerySchema.parse({
          offset: 20,
          limit: 20,
        }),
        routePathname: "/studio/entities/note",
      },
      "/studio/entities/note",
    );

    expect(harness.history.location.search).toBe("");
  });

  it("rewrites a workspace route to its canonical url query", async () => {
    // The rewrite only fires while the browser is on that exact path.
    windowInstance.happyDOM.setURL("http://brain.test/studio/workspaces/inbox");
    const workspace = workspaceInfo({ urlQuery: true });
    const harness = await renderEffects(
      {
        routeTarget: { kind: "workspace", workspaceId: "inbox" },
        workspaces: [workspace],
        activeWorkspace: workspace,
        activeWorkspaceId: "inbox",
        initialUrlWorkspaceQuery: { tab: "all" },
        routeSearch: "",
      },
      "/studio/workspaces/inbox",
    );

    expect(harness.history.location.search).toContain("tab=all");
  });
});
