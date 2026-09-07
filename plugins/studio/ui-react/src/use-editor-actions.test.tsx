/** @jsxImportSource react */
import { installDomGlobals, type RestoreGlobals } from "@brains/test-utils";
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { QueryClientProvider, useMutation } from "@tanstack/react-query";
import {
  createMemoryHistory,
  type RouterHistory,
} from "@tanstack/react-router";
import { Window } from "happy-dom";
import { act, createElement, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  ApiError,
  StudioApi,
  type EntityDetail,
  type StudioTypeCapabilities,
  type TypeSchema,
} from "./api";
import { studioCollectionQuerySchema } from "../../src/collection-query";
import {
  initialEditorWorkflowState,
  type EditorWorkflowAction,
  type EditorWorkflowState,
} from "./editor-workflow";
import type {
  DeleteEntityInput,
  SaveEntityInput,
  SaveEntityResult,
} from "./mutations";
import { createStudioQueryClient } from "./query-client";
import type { FieldAssistState } from "./entity-fields";
import {
  useEditorActions,
  type EditorActions,
  type EditorActionsInput,
} from "./use-editor-actions";

const capabilities: StudioTypeCapabilities = {
  canRead: true,
  canCreate: true,
  canUpdate: true,
  canDelete: true,
  canExtract: false,
  canPublish: false,
  canAssist: true,
};

const noteSchema: TypeSchema = {
  entityType: "note",
  format: "frontmatter",
  isSingleton: false,
  hasBody: true,
  fields: [],
};

const openNote: EntityDetail = {
  id: "n1",
  entityType: "note",
  frontmatter: { title: "One" },
  updated: "2026-09-18T00:00:00.000Z",
  created: "2026-09-18T00:00:00.000Z",
  body: "# One",
  contentHash: "hash-1",
};

function editing(entity: EntityDetail): EditorWorkflowState {
  return {
    ...initialEditorWorkflowState,
    mode: { kind: "edit", entity },
    draft: { ...entity.frontmatter },
    body: entity.body,
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
  await windowInstance.happyDOM.abort();
  windowInstance.close();
  restoreGlobals();
});

interface Harness {
  history: RouterHistory;
  dispatches: EditorWorkflowAction[];
  saves: SaveEntityInput[];
  deletes: DeleteEntityInput[];
  opened: Array<[string, unknown]>;
  assistStates: FieldAssistState[];
  assistRequests: number;
  /** Bump to make every save started before the bump look superseded. */
  requestId: { current: number };
  saveGate: Deferred;
  saveError: Error | null;
  actions: () => EditorActions;
}

async function renderActions(
  overrides: Partial<EditorActionsInput> = {},
): Promise<Harness> {
  const history = createMemoryHistory({
    initialEntries: ["/studio/entities/note/n1"],
  });
  const harness: Harness = {
    history,
    dispatches: [],
    saves: [],
    deletes: [],
    opened: [],
    assistStates: [],
    assistRequests: 0,
    requestId: { current: 1 },
    saveGate: deferred(),
    saveError: null,
    actions: (): EditorActions => {
      throw new Error("hook did not render");
    },
  };
  harness.saveGate.resolve();
  const api = new StudioApi({
    basePath: "/studio",
    fetch: async (input): Promise<Response> => {
      const url = new URL(String(input), "http://brain.test");
      if (url.pathname.endsWith("/assist")) {
        harness.assistRequests += 1;
        return Response.json({
          variant: "summarise",
          targetField: "summary",
          suggestion: "A short summary.",
        });
      }
      return Response.json({}, { status: 404 });
    },
  });
  const client = createStudioQueryClient();
  let latest: EditorActions | undefined;
  function Probe(): ReactElement | null {
    const saveEntityMutation = useMutation({
      mutationFn: async (
        saveInput: SaveEntityInput,
      ): Promise<SaveEntityResult> => {
        harness.saves.push(saveInput);
        await harness.saveGate.promise;
        if (harness.saveError) throw harness.saveError;
        return {
          entityId: saveInput.kind === "update" ? saveInput.id : "created",
          jobId: "job-1",
        };
      },
    });
    const deleteEntityMutation = useMutation({
      mutationFn: async (
        deleteInput: DeleteEntityInput,
      ): Promise<{ deleted: boolean }> => {
        harness.deletes.push(deleteInput);
        return { deleted: true };
      },
    });
    latest = useEditorActions({
      api,
      queryClient: client,
      history,
      studioBasePath: "/studio",
      entityType: "note",
      entityCollectionQuery: studioCollectionQuerySchema.parse({}),
      activeCapabilities: capabilities,
      schema: noteSchema,
      editor: editing(openNote),
      dispatchEditor: (action): void => {
        harness.dispatches.push(action);
      },
      createPath: null,
      syncStatus: null,
      deleting: false,
      saveEntityMutation,
      deleteEntityMutation,
      openEntity: (id, nextState): void => {
        harness.opened.push([id, nextState]);
      },
      currentOpenRequest: (): number => harness.requestId.current,
      setMobilePane: () => undefined,
      setFieldAssistState: (update): void => {
        harness.assistStates.push(
          typeof update === "function"
            ? update(harness.assistStates.at(-1) ?? { kind: "idle" })
            : update,
        );
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
  harness.actions = (): EditorActions => {
    if (!latest) throw new Error("hook did not render");
    return latest;
  };
  return harness;
}

async function settle(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
}

describe("useEditorActions", () => {
  it("saves an open entity as an update against its content hash and reopens it", async () => {
    const harness = await renderActions();

    await act(async () => harness.actions().save());
    await settle();

    expect(harness.saves).toEqual([
      {
        kind: "update",
        entityType: "note",
        id: "n1",
        // Nothing in this schema is conditionally hidden, so the whole draft is sent.
        frontmatter: { title: "One" },
        baseContentHash: "hash-1",
        body: "# One",
      },
    ]);
    expect(harness.dispatches.map((action) => action.type)).toContain(
      "saveStarted",
    );
    expect(harness.opened).toEqual([["n1", { kind: "saved", noop: false }]]);
  });

  it("saves a named creation with its id path", async () => {
    const harness = await renderActions({
      editor: {
        ...initialEditorWorkflowState,
        mode: { kind: "create", segment: "hello" },
        body: "# Hello",
      },
      createPath: ["hello"],
    });

    await act(async () => harness.actions().save());
    await settle();

    expect(harness.saves).toEqual([
      {
        kind: "create",
        entityType: "note",
        idPath: ["hello"],
        frontmatter: {},
        body: "# Hello",
      },
    ]);
  });

  it("ignores a save result once the open request has moved on", async () => {
    const harness = await renderActions();
    harness.saveGate = deferred();

    await act(async () => harness.actions().save());
    harness.requestId.current += 1;
    harness.saveGate.resolve();
    await settle();

    expect(harness.saves).toHaveLength(1);
    expect(harness.opened).toEqual([]);
  });

  it("reports a 409 on an open entity as a conflict", async () => {
    const harness = await renderActions();
    harness.saveError = new ApiError(409, "Someone else saved first");

    await act(async () => harness.actions().save());
    await settle();

    const failed = harness.dispatches.find(
      (action) => action.type === "saveFailed",
    );
    expect(failed).toMatchObject({
      type: "saveFailed",
      save: { kind: "conflict", message: "Someone else saved first" },
    });
    expect(harness.opened).toEqual([]);
  });

  it("refuses to delete without the capability and otherwise returns to the collection", async () => {
    const blocked = await renderActions({
      activeCapabilities: { ...capabilities, canDelete: false },
    });
    await act(async () => blocked.actions().remove());
    await settle();
    expect(blocked.deletes).toEqual([]);

    await act(async () => root.unmount());
    root = createRoot(document.body);
    const allowed = await renderActions();
    await act(async () => allowed.actions().remove());
    await settle();

    expect(allowed.deletes).toEqual([{ entityType: "note", id: "n1" }]);
    expect(allowed.dispatches.map((action) => action.type)).toContain(
      "deleteSucceeded",
    );
    expect(allowed.history.location.pathname).toBe("/studio/entities/note");
  });

  it("requests a field suggestion and applies it back into the draft", async () => {
    const harness = await renderActions();

    await act(async () =>
      harness.actions().runFieldAssist("summarise", "summary"),
    );
    await settle();

    expect(harness.assistRequests).toBe(1);
    expect(harness.assistStates.map((state) => state.kind)).toEqual([
      "loading",
      "suggested",
    ]);

    await act(async () =>
      harness.actions().applyFieldAssist("summary", "A short summary."),
    );

    expect(harness.dispatches.at(-1)).toEqual({
      type: "fieldAssistApplied",
      field: "summary",
      suggestion: "A short summary.",
    });
    expect(harness.assistStates.at(-1)).toEqual({ kind: "idle" });
  });
});
