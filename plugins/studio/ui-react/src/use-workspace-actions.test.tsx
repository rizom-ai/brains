/** @jsxImportSource react */
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { QueryClientProvider, useMutation } from "@tanstack/react-query";
import { Window } from "happy-dom";
import { act, createElement, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  caughtError,
  installDomGlobals,
  type RestoreGlobals,
} from "@brains/test-utils";
import type { StudioWorkspaceInfo } from "./api";
import type { EditorMode } from "./editor-workflow";
import type { DeclarativeWorkspaceActionInput } from "./mutations";
import { createStudioQueryClient } from "./query-client";
import {
  useWorkspaceActions,
  type WorkspaceActions,
  type WorkspaceActionsInput,
} from "./use-workspace-actions";

function publishingWorkspace(
  overrides: Partial<StudioWorkspaceInfo> = {},
): StudioWorkspaceInfo {
  return {
    id: "content-pipeline:publishing",
    pluginId: "content-pipeline",
    label: "Publishing",
    rendererName: "DeclarativeOperatorWorkspace",
    priority: 1,
    permission: "trusted",
    entityTypes: ["post"],
    ...overrides,
  };
}

const confirmation = {
  confirmed: true as const,
  confirmationToken: "token-1",
  contentHash: "token-1",
  expiresAt: "2026-09-19T01:00:00.000Z",
};

const refreshAction = {
  actionId: "refresh",
  label: "Refresh",
  input: {},
};

const editingPost: EditorMode = {
  kind: "edit",
  entity: {
    id: "p1",
    entityType: "post",
    frontmatter: {},
    updated: "2026-09-19T00:00:00.000Z",
    created: "2026-09-19T00:00:00.000Z",
    body: "",
    contentHash: "hash-1",
  },
};

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
  dispatched: DeclarativeWorkspaceActionInput[];
  opened: string[];
  actions: () => WorkspaceActions;
}

async function renderActions(
  result: unknown,
  overrides: Partial<WorkspaceActionsInput> = {},
): Promise<Harness> {
  const harness: Harness = {
    dispatched: [],
    opened: [],
    actions: (): WorkspaceActions => {
      throw new Error("hook did not render");
    },
  };
  const client = createStudioQueryClient();
  let latest: WorkspaceActions | undefined;
  function Probe(): ReactElement | null {
    const declarativeWorkspaceActionMutation = useMutation({
      mutationFn: async (
        actionInput: DeclarativeWorkspaceActionInput,
      ): Promise<unknown> => {
        harness.dispatched.push(actionInput);
        return result;
      },
    });
    latest = useWorkspaceActions({
      queryClient: client,
      workspaces: [publishingWorkspace()],
      activeWorkspaceId: null,
      entityType: "post",
      mode: editingPost,
      declarativeWorkspaceActionMutation,
      openEntity: (id): void => {
        harness.opened.push(id);
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
  harness.actions = (): WorkspaceActions => {
    if (!latest) throw new Error("hook did not render");
    return latest;
  };
  return harness;
}

describe("useWorkspaceActions", () => {
  it("refuses to publish an entity type no workspace claims", async () => {
    const harness = await renderActions({ success: true });

    let caught: unknown;
    try {
      await harness.actions().performPublishingAction({
        type: "publish",
        entityType: "note",
        entityId: "n1",
        confirmation,
      });
    } catch (error) {
      caught = error;
    }

    expect(caughtError(caught).message).toBe("Publishing is unavailable");
    expect(harness.dispatched).toEqual([]);
  });

  it("prepares a confirmation before publishing and does not reopen yet", async () => {
    const harness = await renderActions({
      kind: "prepared-confirmation",
      token: "token-1",
      summary: "Publish this post?",
      expiresAt: "2026-09-19T01:00:00.000Z",
    });

    const outcome = await harness.actions().performPublishingAction({
      type: "publish",
      entityType: "post",
      entityId: "p1",
    });

    expect(harness.dispatched[0]?.action.invocation).toEqual({
      mode: "prepare",
    });
    expect(outcome).toMatchObject({
      needsConfirmation: true,
      summary: "Publish this post?",
      args: { confirmed: true, confirmationToken: "token-1" },
    });
    expect(harness.opened).toEqual([]);
  });

  it("rejects a prepare response that is not a usable confirmation", async () => {
    const harness = await renderActions({ kind: "something-else" });

    let caught: unknown;
    try {
      await harness.actions().performPublishingAction({
        type: "publish",
        entityType: "post",
        entityId: "p1",
      });
    } catch (error) {
      caught = error;
    }

    expect(caughtError(caught).message).toBe(
      "Publishing confirmation is unavailable",
    );
  });

  it("executes a confirmed publish and reopens the entity being edited", async () => {
    const harness = await renderActions({ success: true });

    const outcome = await harness.actions().performPublishingAction({
      type: "publish",
      entityType: "post",
      entityId: "p1",
      confirmation,
    });

    expect(harness.dispatched[0]?.action.invocation).toEqual({
      mode: "execute",
      token: "token-1",
    });
    expect(outcome).toEqual({ success: true });
    expect(harness.opened).toEqual(["p1"]);
  });

  it("surfaces a failed action and leaves the editor alone", async () => {
    const harness = await renderActions({
      success: false,
      error: "Publishing failed",
      code: "conflict",
    });

    const outcome = await harness.actions().performPublishingAction({
      type: "reorder",
      entityType: "post",
      entityId: "p1",
      position: 2,
    });

    expect(outcome).toEqual({
      success: false,
      error: "Publishing failed",
      code: "conflict",
    });
    expect(harness.opened).toEqual([]);
  });

  it("refuses a declarative action without an active workspace", async () => {
    const harness = await renderActions({ ok: true });

    let caught: unknown;
    try {
      await harness.actions().performDeclarativeAction(refreshAction);
    } catch (error) {
      caught = error;
    }

    expect(caughtError(caught).message).toBe(
      "Declarative workspace is unavailable",
    );
  });

  it("dispatches a declarative action to the active workspace", async () => {
    const harness = await renderActions(
      { ok: true },
      { activeWorkspaceId: "inbox" },
    );

    const outcome = await harness
      .actions()
      .performDeclarativeAction(refreshAction);

    expect(harness.dispatched).toEqual([
      { workspaceId: "inbox", action: refreshAction },
    ]);
    expect(outcome).toEqual({ ok: true });
  });
});
