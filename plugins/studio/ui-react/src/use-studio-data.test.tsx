/** @jsxImportSource react */
import { installDomGlobals, type RestoreGlobals } from "@brains/test-utils";
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { QueryClientProvider } from "@tanstack/react-query";
import { Window } from "happy-dom";
import { act, createElement, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { StudioApi, type EntityTypeInfo } from "./api";
import { initialEditorWorkflowState } from "./editor-workflow";
import { createStudioQueryClient } from "./query-client";
import {
  useStudioData,
  type StudioData,
  type StudioDataInput,
} from "./use-studio-data";

const noteType: EntityTypeInfo = {
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
    canAssist: true,
    canPublish: false,
    canExtract: false,
  },
};

function createApi(requests: string[]): StudioApi {
  return new StudioApi({
    basePath: "/studio",
    fetch: async (input): Promise<Response> => {
      const url = new URL(String(input), "http://brain.test");
      requests.push(`${url.pathname}${url.search}`);
      if (url.pathname.endsWith("/types"))
        return Response.json({ types: [noteType], workspaces: [] });
      if (url.pathname.endsWith("/schema"))
        return Response.json({
          entityType: "note",
          format: "frontmatter",
          isSingleton: false,
          hasBody: true,
          fields: [],
        });
      if (url.pathname.endsWith("/hierarchy"))
        return Response.json({ entities: [], total: 0 });
      if (url.pathname.endsWith("/sync-status"))
        return Response.json({ directorySync: null, git: null });
      if (url.pathname.endsWith("/destination"))
        return Response.json({
          idPath: ["hello"],
          entityId: "hello",
          entityLeaf: { start: 0, end: 5 },
          filePath: null,
          fileLeaf: null,
        });
      return Response.json({}, { status: 404 });
    },
  });
}

let restoreGlobals: RestoreGlobals;
let windowInstance: Window;
let root: Root;

beforeEach(() => {
  windowInstance = new Window({ url: "http://brain.test/studio" });
  restoreGlobals = installDomGlobals(windowInstance);
  const container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  windowInstance.close();
  restoreGlobals();
});

async function renderData(
  input: StudioDataInput,
): Promise<{ current: () => StudioData }> {
  let latest: StudioData | undefined;
  function Probe(): ReactElement | null {
    latest = useStudioData(input);
    return null;
  }
  const client = createStudioQueryClient();
  await act(async () => {
    root.render(
      createElement(QueryClientProvider, { client }, createElement(Probe)),
    );
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
  return {
    current: (): StudioData => {
      if (!latest) throw new Error("hook did not render");
      return latest;
    },
  };
}

function baseInput(requests: string[]): StudioDataInput {
  return {
    api: createApi(requests),
    entityType: null,
    activeWorkspaceId: null,
    routeSearch: "",
    workspaceQueries: {},
    editor: initialEditorWorkflowState,
  };
}

describe("useStudioData", () => {
  it("loads navigation and nothing else without an entity type", async () => {
    const requests: string[] = [];
    const data = await renderData(baseInput(requests));

    expect(data.current().types?.map((type) => type.entityType)).toEqual([
      "note",
    ]);
    expect(requests.some((path) => path.endsWith("/types"))).toBe(true);
    expect(requests.some((path) => path.includes("/schema"))).toBe(false);
    expect(requests.some((path) => path.includes("/hierarchy"))).toBe(false);
    expect(requests.some((path) => path.includes("/sync-status"))).toBe(false);
    expect(data.current().schema).toBeNull();
    expect(data.current().entities).toBeNull();
  });

  it("loads the schema, listing and sync status for an entity type", async () => {
    const requests: string[] = [];
    const data = await renderData({
      ...baseInput(requests),
      entityType: "note",
    });

    expect(requests.some((path) => path.includes("/schema?type=note"))).toBe(
      true,
    );
    expect(requests.some((path) => path.includes("/hierarchy?"))).toBe(true);
    expect(requests.some((path) => path.includes("/sync-status"))).toBe(true);
    expect(data.current().schema?.entityType).toBe("note");
    expect(data.current().entities).toEqual([]);
    expect(data.current().activeType?.label).toBe("Notes");
    expect(data.current().activeCapabilities?.canAssist).toBe(true);
  });

  it("previews a destination only for a named creation", async () => {
    const unnamed: string[] = [];
    await renderData({
      ...baseInput(unnamed),
      entityType: "note",
      editor: { ...initialEditorWorkflowState, mode: { kind: "create" } },
    });
    await act(async () => root.unmount());
    root = createRoot(document.body);
    const named: string[] = [];
    const data = await renderData({
      ...baseInput(named),
      entityType: "note",
      editor: {
        ...initialEditorWorkflowState,
        mode: { kind: "create", segment: "hello" },
      },
    });

    expect(unnamed.some((path) => path.includes("/destination"))).toBe(false);
    expect(named.some((path) => path.includes("/destination"))).toBe(true);
    expect(data.current().createPath).toEqual(["hello"]);
    expect(data.current().destinationQuery.data?.entityId).toBe("hello");
  });

  it("takes the workspace request from the stored query when it matches the location", async () => {
    const requests: string[] = [];
    const data = await renderData({
      ...baseInput(requests),
      activeWorkspaceId: "inbox",
      routeSearch: "?tab=all",
      workspaceQueries: {
        inbox: { query: { tab: "all" }, urlSearch: "?tab=all" },
      },
    });

    expect(data.current().workspaceRequestQuery).toEqual({ tab: "all" });
    expect(data.current().activeDeclarativeWorkspace).toBe(false);
    expect(requests.some((path) => path.includes("/workspace"))).toBe(false);
  });
});
