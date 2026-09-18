/** @jsxImportSource react */
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import {
  createMemoryHistory,
  type RouterHistory,
} from "@tanstack/react-router";
import { Window } from "happy-dom";
import { act, createElement, type ReactElement, type RefObject } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { StudioTypeCapabilities, TypeSchema } from "./api";
import { studioCollectionQuerySchema } from "../../src/collection-query";
import type { WorkspaceQueryState } from "./use-studio-data";
import {
  useStudioNavigationActions,
  type PendingOpenState,
  type StudioNavigationActions,
  type StudioNavigationActionsInput,
} from "./use-studio-navigation-actions";

const capabilities: StudioTypeCapabilities = {
  canRead: true,
  canCreate: true,
  canUpdate: true,
  canDelete: false,
  canExtract: false,
  canPublish: false,
  canAssist: false,
};

const noteSchema: TypeSchema = {
  entityType: "note",
  format: "frontmatter",
  isSingleton: false,
  hasBody: true,
  fields: [],
};

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
  pendingOpen: RefObject<PendingOpenState | null>;
  workspaceQueries: Record<string, WorkspaceQueryState>;
  fieldAssistResets: number;
  actions: () => StudioNavigationActions;
}

async function renderActions(
  overrides: Partial<StudioNavigationActionsInput> = {},
  initialPath = "/studio/entities/note",
): Promise<Harness> {
  const history = createMemoryHistory({ initialEntries: [initialPath] });
  const pendingOpen: RefObject<PendingOpenState | null> = { current: null };
  const harness: Harness = {
    history,
    pendingOpen,
    workspaceQueries: {},
    fieldAssistResets: 0,
    actions: () => {
      throw new Error("hook did not render");
    },
  };
  let latest: StudioNavigationActions | undefined;
  function Probe(): ReactElement | null {
    latest = useStudioNavigationActions({
      history,
      studioBasePath: "/studio",
      routeSearch: "",
      entityType: "note",
      entityCollectionQuery: studioCollectionQuerySchema.parse({}),
      workspaces: [],
      schema: noteSchema,
      activeCapabilities: capabilities,
      pendingOpenState: pendingOpen,
      setFieldAssistState: () => {
        harness.fieldAssistResets += 1;
      },
      setWorkspaceQueries: (update) => {
        harness.workspaceQueries =
          typeof update === "function"
            ? update(harness.workspaceQueries)
            : update;
      },
      ...overrides,
    });
    return null;
  }
  await act(async () => {
    root.render(createElement(Probe));
  });
  harness.actions = (): StudioNavigationActions => {
    if (!latest) throw new Error("hook did not render");
    return latest;
  };
  return harness;
}

describe("useStudioNavigationActions", () => {
  it("routes rail selections to collection and workspace paths", async () => {
    const harness = await renderActions();

    await act(async () => harness.actions().selectEntityType("post"));
    expect(harness.history.location.pathname).toBe("/studio/entities/post");

    await act(async () => harness.actions().selectWorkspace("inbox"));
    expect(harness.history.location.pathname).toBe("/studio/workspaces/inbox");
  });

  it("changes the page and folder through the collection search", async () => {
    const harness = await renderActions();

    await act(async () => harness.actions().changeEntityPage(20));
    expect(harness.history.location.pathname).toBe("/studio/entities/note");
    expect(harness.history.location.search).toContain("offset=20");

    await act(async () => harness.actions().selectFolder(["archive"]));
    expect(harness.history.location.search).toContain("archive");
    // A folder change resets paging; the default offset is omitted from the search.
    expect(harness.history.location.search).not.toContain("offset=");
  });

  it("starts a creation only when the type allows it", async () => {
    const blocked = await renderActions({
      activeCapabilities: { ...capabilities, canCreate: false },
    });
    await act(async () => blocked.actions().startCreate());
    expect(blocked.history.location.search).toBe("");

    await act(async () => root.unmount());
    root = createRoot(document.body);
    const allowed = await renderActions();
    await act(async () => allowed.actions().startCreate());
    expect(allowed.history.location.search).toContain("mode=create");
    expect(allowed.history.location.state).toMatchObject({
      studioCollectionPath: expect.stringContaining("/studio/entities/note"),
    });
    expect(allowed.fieldAssistResets).toBe(1);
  });

  it("opens a workspace entity and records the pending open for the opener", async () => {
    const harness = await renderActions();

    await act(async () => harness.actions().openWorkspaceEntity("post", "p1"));

    expect(harness.history.location.pathname).toBe("/studio/entities/post/p1");
    expect(harness.history.location.state).toMatchObject({
      studioCollectionPath: "/studio/entities/post",
    });
    expect(harness.pendingOpen.current).toEqual({
      pathname: "/studio/entities/post/p1",
      save: { kind: "idle" },
    });
  });

  it("falls back to replacing the collection path when there is nothing to go back to", async () => {
    const harness = await renderActions({}, "/studio/entities/note/n1");

    await act(async () => harness.actions().backToList());

    expect(harness.history.location.pathname).toBe("/studio/entities/note");
    expect(harness.history.length).toBe(1);
  });

  it("stores a workspace query without a url search for a workspace it does not know", async () => {
    const harness = await renderActions();

    await act(async () =>
      harness.actions().changeWorkspaceQuery("inbox", { tab: "all" }),
    );

    expect(harness.workspaceQueries).toEqual({
      inbox: { query: { tab: "all" } },
    });
  });

  it("routes launch intents to their workspaces", async () => {
    const harness = await renderActions();

    await act(async () =>
      harness.actions().openWorkspaceLaunch({ target: "site" }),
    );

    expect(decodeURIComponent(harness.history.location.pathname)).toBe(
      "/studio/workspaces/site-builder:site",
    );
  });
});
