/** @jsxImportSource react */
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  type RouterHistory,
} from "@tanstack/react-router";
import { Window } from "happy-dom";
import { act, createElement, type ReactElement, type RefObject } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  StudioApi,
  type EntityDetail,
  type StudioTypeCapabilities,
} from "./api";
import { studioCollectionQuerySchema } from "../../src/collection-query";
import type { EditorWorkflowAction } from "./editor-workflow";
import { createStudioQueryClient } from "./query-client";
import type { MobileEditorPane } from "./app-view";
import {
  useEntityOpener,
  type EntityOpener,
  type EntityOpenerInput,
} from "./use-entity-opener";

const capabilities: StudioTypeCapabilities = {
  canRead: true,
  canCreate: true,
  canUpdate: true,
  canDelete: false,
  canExtract: false,
  canPublish: false,
  canAssist: false,
};

function entity(id: string): EntityDetail {
  return {
    id,
    entityType: "note",
    frontmatter: { title: id },
    updated: "2026-09-18T00:00:00.000Z",
    created: "2026-09-18T00:00:00.000Z",
    body: `# ${id}`,
    contentHash: `hash-${id}`,
  };
}

interface Deferred {
  resolve: () => void;
  promise: Promise<void>;
}

function deferred(): Deferred {
  let resolve: () => void = () => undefined;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { resolve, promise };
}

interface Transport {
  api: StudioApi;
  entityFetches: string[];
  /** Hold an entity response until released. */
  hold: (id: string) => Deferred;
}

function createTransport(): Transport {
  const entityFetches: string[] = [];
  const holds = new Map<string, Deferred>();
  const api = new StudioApi({
    basePath: "/studio",
    fetch: async (input): Promise<Response> => {
      const url = new URL(String(input), "http://brain.test");
      if (url.pathname.endsWith("/schema"))
        return Response.json({
          entityType: "note",
          format: "frontmatter",
          isSingleton: false,
          hasBody: true,
          fields: [],
        });
      if (url.pathname.endsWith("/entities")) {
        const id = url.searchParams.get("id") ?? "";
        entityFetches.push(id);
        await holds.get(id)?.promise;
        return Response.json({ entity: entity(id) });
      }
      return Response.json({}, { status: 404 });
    },
  });
  return {
    api,
    entityFetches,
    hold: (id): Deferred => {
      const gate = deferred();
      holds.set(id, gate);
      return gate;
    },
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
  dispatches: EditorWorkflowAction[];
  render: (overrides?: Partial<EntityOpenerInput>) => Promise<void>;
  opener: () => EntityOpener;
}

function createHarness(transport: Transport, initialPath: string): Harness {
  const history = createMemoryHistory({ initialEntries: [initialPath] });
  const dispatches: EditorWorkflowAction[] = [];
  const preferredMobilePane: RefObject<MobileEditorPane | null> = {
    current: null,
  };
  const client = createStudioQueryClient();
  let latest: EntityOpener | undefined;
  const baseInput = (): EntityOpenerInput => ({
    api: transport.api,
    queryClient: client,
    history,
    studioBasePath: "/studio",
    routeTarget: { kind: "collection", entityType: "note" },
    routePathname: history.location.pathname,
    routeSearch: "",
    currentStudioPathname: history.location.pathname,
    createMode: false,
    entityType: "note",
    activeCapabilities: capabilities,
    entityCollectionQuery: studioCollectionQuerySchema.parse({}),
    preferredMobilePane,
    dispatchEditor: (action): void => {
      dispatches.push(action);
    },
    setMobilePane: () => undefined,
    setBodyMode: () => undefined,
    setFieldAssistState: () => undefined,
  });
  return {
    history,
    dispatches,
    render: async (overrides = {}): Promise<void> => {
      const input = { ...baseInput(), ...overrides };
      function Probe(): ReactElement | null {
        latest = useEntityOpener(input);
        return null;
      }
      await act(async () => {
        root.render(
          createElement(QueryClientProvider, { client }, createElement(Probe)),
        );
      });
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 20));
      });
    },
    opener: (): EntityOpener => {
      if (!latest) throw new Error("hook did not render");
      return latest;
    },
  };
}

function openedIds(dispatches: EditorWorkflowAction[]): string[] {
  return dispatches.flatMap((action) =>
    action.type === "documentOpened" ? [action.document.entity.id] : [],
  );
}

describe("useEntityOpener", () => {
  it("opens the route's entity into the editor", async () => {
    const transport = createTransport();
    const harness = createHarness(transport, "/studio/entities/note/n1");

    await harness.render({
      routeTarget: { kind: "entity", entityType: "note", id: "n1" },
    });

    expect(transport.entityFetches).toEqual(["n1"]);
    expect(openedIds(harness.dispatches)).toEqual(["n1"]);
    expect(harness.opener().loadError).toBeNull();
  });

  it("drops a superseded open when a later route wins the race", async () => {
    const transport = createTransport();
    const slow = transport.hold("n1");
    const harness = createHarness(transport, "/studio/entities/note/n1");

    await harness.render({
      routeTarget: { kind: "entity", entityType: "note", id: "n1" },
    });
    await harness.render({
      routeTarget: { kind: "entity", entityType: "note", id: "n2" },
      routePathname: "/studio/entities/note/n2",
      currentStudioPathname: "/studio/entities/note/n2",
    });
    slow.resolve();
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    expect(transport.entityFetches).toEqual(["n1", "n2"]);
    expect(openedIds(harness.dispatches)).toEqual(["n2"]);
  });

  it("navigates to the entity route and records the pending open when the route differs", async () => {
    const transport = createTransport();
    const harness = createHarness(transport, "/studio/entities/note");
    await harness.render();

    await act(async () => harness.opener().openEntity("n3", { kind: "saved" }));

    expect(harness.history.location.pathname).toBe("/studio/entities/note/n3");
    expect(harness.opener().pendingOpenState.current).toEqual({
      pathname: "/studio/entities/note/n3",
      save: { kind: "saved" },
    });
    expect(transport.entityFetches).toEqual([]);
  });

  it("re-runs the open on retry and ignores results after supersession", async () => {
    const transport = createTransport();
    const harness = createHarness(transport, "/studio/entities/note/n1");
    await harness.render({
      routeTarget: { kind: "entity", entityType: "note", id: "n1" },
    });
    expect(transport.entityFetches).toEqual(["n1"]);

    const slow = transport.hold("n1");
    await act(async () => harness.opener().retryOpen());
    await act(async () => harness.opener().supersedeOpen());
    slow.resolve();
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    expect(transport.entityFetches).toEqual(["n1", "n1"]);
    expect(openedIds(harness.dispatches)).toEqual(["n1"]);
    expect(harness.opener().currentOpenRequest()).toBeGreaterThan(1);
  });
});
