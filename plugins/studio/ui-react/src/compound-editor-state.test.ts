import { describe, expect, test } from "bun:test";
import {
  editorWorkflowReducer,
  hasInvalidEditorFields,
  hasUnsavedEditorChanges,
  initialEditorWorkflowState,
} from "./editor-workflow";

describe("compound editor drafts", () => {
  test("guards a locally retained draft even when its serialized value is unchanged", () => {
    const clean = editorWorkflowReducer(initialEditorWorkflowState, {
      type: "creationStarted",
      singleton: true,
      draft: { groupings: {} },
    });
    const pending = editorWorkflowReducer(clean, {
      type: "compoundFieldStateChanged",
      field: "groupings",
      pendingChanges: true,
      invalid: true,
    });
    expect(pending.draft).toEqual(clean.draft);
    expect(hasUnsavedEditorChanges(pending)).toBe(true);
    expect(hasInvalidEditorFields(pending)).toBe(true);
    const repaired = editorWorkflowReducer(pending, {
      type: "compoundFieldStateChanged",
      field: "groupings",
      pendingChanges: false,
      invalid: false,
    });
    expect(hasUnsavedEditorChanges(repaired)).toBe(false);
    expect(hasInvalidEditorFields(repaired)).toBe(false);
  });
  test("invalid serialization blocks save independently of dirty state and resets on navigation", () => {
    const clean = editorWorkflowReducer(initialEditorWorkflowState, {
      type: "creationStarted",
      singleton: true,
      draft: { groupings: {} },
    });
    const invalid = editorWorkflowReducer(clean, {
      type: "compoundFieldStateChanged",
      field: "groupings",
      pendingChanges: false,
      invalid: true,
    });
    expect(hasUnsavedEditorChanges(invalid)).toBe(false);
    expect(hasInvalidEditorFields(invalid)).toBe(true);
    const reset = editorWorkflowReducer(invalid, { type: "collectionChanged" });
    expect(hasUnsavedEditorChanges(reset)).toBe(false);
    expect(hasInvalidEditorFields(reset)).toBe(false);
  });
});
