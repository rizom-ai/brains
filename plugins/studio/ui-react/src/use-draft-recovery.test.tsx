/** @jsxImportSource react */
import { installDomGlobals, type RestoreGlobals } from "@brains/test-utils";
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { Window } from "happy-dom";
import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { FieldDescriptor } from "./api";
import { createEditorDocument } from "./editor-document";
import { draftKey, keepDraft, recoverDraft } from "./draft-store";
import {
  editorWorkflowReducer,
  hasUnsavedEditorChanges,
  initialEditorWorkflowState,
  type EditorWorkflowAction,
  type EditorWorkflowState,
} from "./editor-workflow";
import { useDraftRecovery, type DraftRecovery } from "./use-draft-recovery";

let window: Window;
let restore: RestoreGlobals;
let root: Root;
let recovery: DraftRecovery;
const dispatched: EditorWorkflowAction[] = [];
const at = Date.parse("2026-11-27T14:02:00.000Z");
const titleField: FieldDescriptor = {
  name: "title",
  label: "Title",
  widget: "string",
};
const tokenField: FieldDescriptor = {
  name: "token",
  label: "Token",
  widget: "string",
  secret: true,
};
const fields = [titleField, tokenField];
const key = draftKey("usr_alex", "post:field-notes");

function opened(): EditorWorkflowState {
  return editorWorkflowReducer(initialEditorWorkflowState, {
    type: "documentOpened",
    document: createEditorDocument({
      id: "field-notes",
      entityType: "post",
      frontmatter: { title: "Field notes" },
      body: "Saved body",
      contentHash: "hash-1",
      created: "2026-07-14T08:00:00.000Z",
      updated: "2026-07-14T09:00:00.000Z",
    }),
  });
}

function Probe(props: { editor: EditorWorkflowState }): ReactElement | null {
  recovery = useDraftRecovery({
    principalId: "usr_alex",
    entityType: "post",
    editor: props.editor,
    hasUnsavedChanges: hasUnsavedEditorChanges(props.editor),
    fields,
    dispatch: (action) => dispatched.push(action),
    storage: localStorage,
    now: () => at,
    delay: 0,
  });
  return null;
}

async function render(editor: EditorWorkflowState): Promise<void> {
  await act(async () => root.render(<Probe editor={editor} />));
  // Effects run once the render settles; then the keep timer has its turn.
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 5));
  });
}

beforeEach(() => {
  window = new Window();
  restore = installDomGlobals(window, { localStorage: window.localStorage });
  dispatched.length = 0;
  root = createRoot(document.createElement("div"));
});

afterEach(async () => {
  await act(async () => root.unmount());
  window.close();
  restore();
});

describe("draft recovery", () => {
  it("offers a draft kept for the entry it opens, and restores it", async () => {
    keepDraft(localStorage, key, {
      draft: { title: "Field notes, revised" },
      body: "Unsaved body",
      baseContentHash: "hash-1",
      savedAt: at - 60_000,
      secretFields: [],
    });
    await render(opened());
    expect(recovery.offer?.savedAt).toBe(at - 60_000);
    await act(async () => recovery.restore());
    expect(dispatched).toEqual([
      {
        type: "draftRestored",
        draft: { title: "Field notes, revised" },
        body: "Unsaved body",
      },
    ]);
    expect(recovery.offer).toBeNull();
  });

  it("keeps unsaved edits, without credentials, and forgets them once saved", async () => {
    const storage = localStorage;
    const edited = editorWorkflowReducer(
      editorWorkflowReducer(opened(), {
        type: "fieldChanged",
        descriptor: tokenField,
        raw: "s3cret",
      }),
      { type: "bodyChanged", body: "Typed, not saved" },
    );
    await render(edited);
    expect(recoverDraft(storage, key, at)?.body).toBe("Typed, not saved");
    expect(storage.getItem(key)).not.toContain("s3cret");
    // Back to what is saved: nothing is kept.
    await render(opened());
    expect(storage.getItem(key)).toBeNull();
  });

  it("forgets a kept draft when it is discarded", async () => {
    const storage = localStorage;
    keepDraft(storage, key, {
      draft: {},
      body: "Unsaved body",
      savedAt: at,
      secretFields: [],
    });
    await render(opened());
    await act(async () => recovery.discard());
    expect(storage.getItem(key)).toBeNull();
    expect(recovery.offer).toBeNull();
    expect(dispatched).toEqual([]);
  });
});
