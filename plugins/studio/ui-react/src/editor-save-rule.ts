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
