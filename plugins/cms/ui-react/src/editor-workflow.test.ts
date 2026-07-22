import { describe, expect, it } from "bun:test";
import type { EntityDetail } from "./api";
import { createEditorDocument } from "./editor-document";
import {
  editorWorkflowReducer,
  hasUnsavedEditorChanges,
  initialEditorWorkflowState,
  type EditorWorkflowState,
} from "./editor-workflow";

function entity(contentHash = "hash-1"): EntityDetail {
  return {
    id: "field-notes",
    entityType: "post",
    frontmatter: { title: "Field notes" },
    body: "Original body",
    contentHash,
    created: "2026-07-14T08:00:00.000Z",
    updated: "2026-07-14T09:00:00.000Z",
  };
}

function editingState(): EditorWorkflowState {
  return editorWorkflowReducer(initialEditorWorkflowState, {
    type: "documentOpened",
    document: createEditorDocument(entity()),
  });
}

describe("hasUnsavedEditorChanges", () => {
  it("distinguishes clean documents from edited and creation drafts", () => {
    const clean = editingState();
    expect(hasUnsavedEditorChanges(clean)).toBe(false);
    expect(
      hasUnsavedEditorChanges(
        editorWorkflowReducer(clean, {
          type: "bodyChanged",
          body: "Changed body",
        }),
      ),
    ).toBe(true);
    expect(
      hasUnsavedEditorChanges(
        editorWorkflowReducer(initialEditorWorkflowState, {
          type: "creationStarted",
          draft: {},
        }),
      ),
    ).toBe(true);
  });
});

describe("editorWorkflowReducer", () => {
  it("starts creation atomically from browsing", () => {
    const next = editorWorkflowReducer(initialEditorWorkflowState, {
      type: "creationStarted",
      draft: { status: "draft" },
    });

    expect(next).toEqual({
      mode: { kind: "create" },
      draft: { status: "draft" },
      body: "",
      save: { kind: "idle" },
      deleteOpen: false,
    });
  });

  it("rejects creation and document edits while browsing rules disallow them", () => {
    const editing = editingState();
    const duplicateCreate = editorWorkflowReducer(editing, {
      type: "creationStarted",
      draft: {},
    });
    const browseDraft = editorWorkflowReducer(initialEditorWorkflowState, {
      type: "fieldChanged",
      descriptor: { name: "title", label: "Title", widget: "string" },
      raw: "Not allowed",
    });
    const browseSave = editorWorkflowReducer(initialEditorWorkflowState, {
      type: "saveStarted",
    });

    expect(duplicateCreate).toBe(editing);
    expect(browseDraft).toBe(initialEditorWorkflowState);
    expect(browseSave).toBe(initialEditorWorkflowState);
  });

  it("replaces dirty input only on an explicit document-open transition", () => {
    const dirty = editorWorkflowReducer(editingState(), {
      type: "fieldChanged",
      descriptor: { name: "title", label: "Title", widget: "string" },
      raw: "Unsaved title",
    });
    const refreshed = createEditorDocument(entity("hash-2"));
    refreshed.draft["title"] = "Server title";

    const next = editorWorkflowReducer(dirty, {
      type: "documentOpened",
      document: refreshed,
      save: { kind: "saved", noop: true },
    });

    expect(next.mode.kind).toBe("edit");
    if (next.mode.kind !== "edit") throw new Error("Expected edit mode");
    expect(next.mode.entity.contentHash).toBe("hash-2");
    expect(next.draft["title"]).toBe("Server title");
    expect(next.save).toEqual({ kind: "saved", noop: true });
  });

  it("merges delayed field results without replacing other draft edits", () => {
    const titleChanged = editorWorkflowReducer(editingState(), {
      type: "fieldChanged",
      descriptor: { name: "title", label: "Title", widget: "string" },
      raw: "Edited title",
    });

    const assisted = editorWorkflowReducer(titleChanged, {
      type: "fieldAssistApplied",
      field: "excerpt",
      suggestion: "Generated later",
    });

    expect(assisted.draft).toEqual({
      title: "Edited title",
      excerpt: "Generated later",
    });
  });

  it("preserves the dirty document when a save conflicts", () => {
    const dirty = editorWorkflowReducer(editingState(), {
      type: "bodyChanged",
      body: "Unsaved body",
    });
    const saving = editorWorkflowReducer(dirty, { type: "saveStarted" });

    const conflicted = editorWorkflowReducer(saving, {
      type: "saveFailed",
      save: { kind: "conflict", message: "Content changed" },
    });

    expect(conflicted.body).toBe("Unsaved body");
    expect(conflicted.save).toEqual({
      kind: "conflict",
      message: "Content changed",
    });
    expect(conflicted.mode).toEqual(dirty.mode);
  });

  it("allows deletion only for an opened entity and closes failures", () => {
    const create = editorWorkflowReducer(initialEditorWorkflowState, {
      type: "creationStarted",
      draft: {},
    });
    expect(editorWorkflowReducer(create, { type: "deleteRequested" })).toBe(
      create,
    );

    const editing = editingState();
    const requested = editorWorkflowReducer(editing, {
      type: "deleteRequested",
    });
    expect(requested.deleteOpen).toBe(true);

    const failed = editorWorkflowReducer(requested, {
      type: "deleteFailed",
      message: "Delete unavailable",
    });
    expect(failed.deleteOpen).toBe(false);
    expect(failed.save).toEqual({
      kind: "error",
      message: "Delete unavailable",
    });
  });

  it("returns to a clean browser state after browse, collection, or delete", () => {
    const editing = editingState();

    expect(editorWorkflowReducer(editing, { type: "browseRequested" })).toBe(
      initialEditorWorkflowState,
    );
    expect(editorWorkflowReducer(editing, { type: "collectionChanged" })).toBe(
      initialEditorWorkflowState,
    );
    expect(editorWorkflowReducer(editing, { type: "deleteSucceeded" })).toBe(
      initialEditorWorkflowState,
    );
  });
});
