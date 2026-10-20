import { GROUPING_DEFINITIONS_TYPE } from "../../src/grouping-definitions-contract";
import {
  hasInvalidEditorFields,
  type EditorWorkflowState,
} from "./editor-workflow";
import type { StudioAppModel } from "./studio-app-model";

export type EditorSaveModel = Pick<
  StudioAppModel,
  "canEdit" | "destinationBlocked" | "selectedEntityType" | "entitySchema"
>;

/** The element that says why save refuses; the save button points at it. */
export const STUDIO_SAVE_REASON_ID = "studio-save-reason";

/** Why save refuses, in words for the author; undefined when it does not. */
export function editorSaveBlockReason(
  editor: EditorWorkflowState,
  model: EditorSaveModel,
  hasUnsavedChanges: boolean,
): string | undefined {
  if (!isEditorSaveBlocked(editor, model, hasUnsavedChanges)) return undefined;
  if (hasInvalidEditorFields(editor))
    return "Fix the highlighted fields first.";
  if (model.destinationBlocked && editor.mode.kind === "create")
    return "Name the file to create this entry.";
  return undefined;
}

/**
 * Whether the editor's save — the Save button, the form submit and Ctrl/⌘+S —
 * must refuse. Documents that write even when unchanged (a new singleton, the
 * grouping definitions) only save once something changed.
 */
export function isEditorSaveBlocked(
  editor: EditorWorkflowState,
  model: EditorSaveModel,
  hasUnsavedChanges: boolean,
): boolean {
  const definitions = model.selectedEntityType === GROUPING_DEFINITIONS_TYPE;
  const savesOnlyChanges =
    definitions ||
    (editor.mode.kind === "create" && model.entitySchema.isSingleton);
  return (
    !model.canEdit ||
    hasInvalidEditorFields(editor) ||
    (definitions && !model.entitySchema.groupingDefinitions) ||
    model.destinationBlocked ||
    editor.save.kind === "saving" ||
    (savesOnlyChanges && !hasUnsavedChanges)
  );
}
