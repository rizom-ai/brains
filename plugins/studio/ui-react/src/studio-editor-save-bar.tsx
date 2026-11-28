/** @jsxImportSource react */
import { StudioAskToggle } from "./studio-ask-toggle";
import { Button } from "@brains/app-ui-react";
import type { ReactElement } from "react";
import type { StudioAppViewProps } from "./app-view-props";
import { createEditorDocument } from "./editor-document";
import { editorSaveLabel, SaveStateNotice } from "./editor-status";
import type { StudioAppModel } from "./studio-app-model";
import {
  STUDIO_SAVE_REASON_ID,
  editorSaveBlockReason,
} from "./editor-save-rule";
import { StudioConflictRecovery } from "./studio-conflict-recovery";
import { editorLayoutStyles as layout } from "./studio-editor-layout.styles";
import {
  editorClassName as editorClass,
  editorStyles,
} from "./studio-editor.styles";
import { StudioStatus } from "./studio-status";

/** The editor's footer: one line on where the save stands and why. */
export function StudioEditorSaveBar(
  props: StudioAppViewProps & { model: StudioAppModel },
): ReactElement {
  const { editor, syncStatus, hasUnsavedChanges, dispatchEditor } = props;
  const { mode, draft, body, save: saveState } = editor;
  const { entitySchema, presentation, canEdit } = props.model;
  const saveBlockReason =
    canEdit || presentation === "split"
      ? editorSaveBlockReason(editor, props.model, hasUnsavedChanges)
      : undefined;

  return (
    <footer
      className={editorClass("", editorStyles.pipeline, layout.pipeline)}
      data-studio-save-bar=""
    >
      <div>
        <span
          data-studio-save-state=""
          className={editorClass("", layout.saveState)}
        >
          <span
            role="status"
            aria-live="polite"
            title="Saved means stored in this Brain. File export and Git synchronization are separate."
          >
            {!canEdit && presentation !== "split"
              ? "Read-only"
              : editorSaveLabel(
                  saveState,
                  hasUnsavedChanges,
                  mode.kind !== "create"
                    ? "edit"
                    : entitySchema.isSingleton
                      ? "first-save"
                      : "create",
                )}
          </span>
          {saveBlockReason && (
            <span id={STUDIO_SAVE_REASON_ID}>{saveBlockReason}</span>
          )}
        </span>
        {props.readError && (
          <StudioStatus tone="error">
            Your draft is unchanged. {props.readError}
            <Button type="button" variant="ghost" onClick={props.onRetryRead}>
              Retry
            </Button>
          </StudioStatus>
        )}
        <SaveStateNotice
          // The strip already narrates a successful save; the text
          // notice stays for conflicts, errors, and no-op saves
          // (which the strip cannot distinguish from a real write).
          state={
            syncStatus?.directorySync &&
            saveState.kind === "saved" &&
            !saveState.noop
              ? { kind: "idle" }
              : saveState
          }
          conflictActions={
            mode.kind === "edit" ? (
              <StudioConflictRecovery
                key={`${mode.entity.entityType}:${mode.entity.id}`}
                entity={mode.entity}
                draft={draft}
                body={body}
                {...(saveState.kind === "conflict" &&
                  saveState.conflictId !== undefined && {
                    conflictId: saveState.conflictId,
                  })}
                onUseLatest={(entity) =>
                  dispatchEditor({
                    type: "documentOpened",
                    document: createEditorDocument(entity),
                  })
                }
              />
            ) : undefined
          }
        />
      </div>
      {props.ask && mode.kind === "edit" && props.model.canAssist && (
        <StudioAskToggle ask={props.ask} placement="bar" />
      )}
    </footer>
  );
}
