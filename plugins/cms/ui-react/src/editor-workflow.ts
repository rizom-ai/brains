import type { EntityDetail, FieldDescriptor } from "./api";
import type { EditorDocument } from "./editor-document";

export type SaveState =
  | { kind: "idle" }
  | { kind: "saving" }
  /** noop: the entity service skipped a byte-identical write. */
  | { kind: "saved"; noop?: boolean }
  | { kind: "conflict"; message: string }
  | { kind: "error"; message: string };

export type EditorMode =
  | { kind: "browse" }
  | { kind: "edit"; entity: EntityDetail }
  | { kind: "create" };

export interface EditorWorkflowState {
  mode: EditorMode;
  draft: Record<string, unknown>;
  body: string;
  save: SaveState;
  deleteOpen: boolean;
}

export type EditorWorkflowAction =
  | { type: "collectionChanged" }
  | { type: "documentOpened"; document: EditorDocument; save?: SaveState }
  | { type: "creationStarted"; draft: Record<string, unknown> }
  | { type: "browseRequested" }
  | { type: "fieldChanged"; descriptor: FieldDescriptor; raw: unknown }
  | { type: "fieldAssistApplied"; field: string; suggestion: string | string[] }
  | { type: "bodyChanged"; body: string }
  | { type: "saveStarted" }
  | {
      type: "saveFailed";
      save: Extract<SaveState, { kind: "conflict" | "error" }>;
    }
  | { type: "deleteRequested" }
  | { type: "deleteCancelled" }
  | { type: "deleteSucceeded" }
  | { type: "deleteFailed"; message: string };

/** Apply a widget value without replacing edits made to other draft fields. */
export function applyFieldChange(
  draft: Record<string, unknown>,
  descriptor: FieldDescriptor,
  raw: unknown,
): Record<string, unknown> {
  const next = { ...draft };
  if (raw === "") {
    delete next[descriptor.name];
    return next;
  }
  if (descriptor.widget === "boolean") {
    next[descriptor.name] = raw === true;
    return next;
  }
  if (descriptor.widget === "number") {
    next[descriptor.name] = Number(raw);
    return next;
  }
  next[descriptor.name] = raw;
  return next;
}

export const initialEditorWorkflowState: EditorWorkflowState = {
  mode: { kind: "browse" },
  draft: {},
  body: "",
  save: { kind: "idle" },
  deleteOpen: false,
};

/** Whether leaving the current route would discard an editor draft. */
export function hasUnsavedEditorChanges(state: EditorWorkflowState): boolean {
  if (state.mode.kind === "browse") return false;
  if (state.mode.kind === "create") return true;
  return (
    state.body !== state.mode.entity.body ||
    JSON.stringify(state.draft) !==
      JSON.stringify(state.mode.entity.frontmatter)
  );
}

export function editorWorkflowReducer(
  state: EditorWorkflowState,
  action: EditorWorkflowAction,
): EditorWorkflowState {
  switch (action.type) {
    case "collectionChanged":
      return initialEditorWorkflowState;
    case "documentOpened":
      return {
        mode: { kind: "edit", entity: action.document.entity },
        draft: action.document.draft,
        body: action.document.body,
        save: action.save ?? { kind: "idle" },
        deleteOpen: false,
      };
    case "creationStarted":
      if (state.mode.kind !== "browse") return state;
      return {
        mode: { kind: "create" },
        draft: action.draft,
        body: "",
        save: { kind: "idle" },
        deleteOpen: false,
      };
    case "browseRequested":
      return initialEditorWorkflowState;
    case "fieldChanged":
      return state.mode.kind === "browse"
        ? state
        : {
            ...state,
            draft: applyFieldChange(state.draft, action.descriptor, action.raw),
          };
    case "fieldAssistApplied":
      return state.mode.kind === "browse"
        ? state
        : {
            ...state,
            draft: { ...state.draft, [action.field]: action.suggestion },
          };
    case "bodyChanged":
      return state.mode.kind === "browse"
        ? state
        : { ...state, body: action.body };
    case "saveStarted":
      return state.mode.kind === "browse"
        ? state
        : { ...state, save: { kind: "saving" } };
    case "saveFailed":
      return state.mode.kind === "browse"
        ? state
        : { ...state, save: action.save };
    case "deleteRequested":
      return state.mode.kind === "edit"
        ? { ...state, deleteOpen: true }
        : state;
    case "deleteCancelled":
      return state.deleteOpen ? { ...state, deleteOpen: false } : state;
    case "deleteSucceeded":
      return state.mode.kind === "edit" ? initialEditorWorkflowState : state;
    case "deleteFailed":
      return state.mode.kind === "edit"
        ? {
            ...state,
            deleteOpen: false,
            save: { kind: "error", message: action.message },
          }
        : state;
  }
}
