/** @jsxImportSource react */
import {
  Button,
  buttonClassName,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@brains/app-ui-react";
import type { ReactElement } from "react";
import type { StudioAppViewProps } from "./app-view-props";
import { createEditorDocument } from "./editor-document";
import {
  derivePipeline,
  editorSaveLabel,
  PipelineStations,
  SaveStateNotice,
} from "./editor-status";
import type { StudioAppModel } from "./studio-app-model";
import { StudioConflictRecovery } from "./studio-conflict-recovery";
import { editorLayoutStyles as layout } from "./studio-editor-layout.styles";
import {
  editorClassName as editorClass,
  editorStyles,
} from "./studio-editor.styles";
import { StudioStatus } from "./studio-status";

/** The editor's footer: where the save stands, sync detail and deletion. */
export function StudioEditorSaveBar(
  props: StudioAppViewProps & { model: StudioAppModel },
): ReactElement {
  const { editor, syncStatus, hasUnsavedChanges, dispatchEditor } = props;
  const { mode, draft, body, save: saveState } = editor;
  const { entitySchema, presentation, canEdit, canDelete } = props.model;
  const requestDelete = (): void => dispatchEditor({ type: "deleteRequested" });

  return (
    <footer
      className={editorClass("", editorStyles.pipeline, layout.pipeline)}
      data-studio-save-bar=""
    >
      <div>
        <span
          role="status"
          aria-live="polite"
          title="Saved means stored in this Brain. File export and Git synchronization are separate."
        >
          {!canEdit && presentation !== "split"
            ? "Read-only"
            : editorSaveLabel(saveState, hasUnsavedChanges)}
        </span>
        {props.readError && (
          <StudioStatus tone="error">
            Your draft is unchanged. {props.readError}
            <Button type="button" variant="ghost" onClick={props.onRetryRead}>
              Retry
            </Button>
          </StudioStatus>
        )}
        {syncStatus?.directorySync && (
          <details>
            <summary>Sync details</summary>
            <PipelineStations
              view={derivePipeline({
                save: saveState,
                git: syncStatus.git,
                baselineCommit: props.baselineCommit,
              })}
              gitConfigured={syncStatus.git !== null}
            />
          </details>
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
      <span className={editorClass("", layout.spacer)} />
      {mode.kind === "edit" && !entitySchema.isSingleton && canDelete && (
        <>
          <span className={editorClass("", layout.desktop)}>
            <Button
              type="button"
              variant="danger"
              xstyle={layout.danger}
              onClick={requestDelete}
            >
              Delete
            </Button>
          </span>
          <span className={editorClass("", layout.more)}>
            <DropdownMenu>
              <DropdownMenuTrigger
                className={buttonClassName("ghost", "icon")}
                aria-label="More document actions"
              >
                •••
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  variant="destructive"
                  onSelect={requestDelete}
                >
                  Delete entry
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </span>
        </>
      )}
    </footer>
  );
}
