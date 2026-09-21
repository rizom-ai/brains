/** @jsxImportSource react */
import * as stylex from "@stylexjs/stylex";
import { StudioSystemFields } from "./studio-system-fields";
import { StudioVocabularyEditor } from "./studio-vocabulary-editor";
import { GROUPING_VOCABULARY_TYPE } from "../../src/grouping-vocabulary-contract";
import { systemFieldStyles } from "./studio-system-fields.styles";
import {
  Button,
  buttonClassName,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@brains/app-ui-react";
import type { ReactElement } from "react";
import { headStyles } from "./studio-page-head.styles";
import { typographyStyles } from "./studio-typography.styles";
import { StudioStatus } from "./studio-status";
import {
  StudioEditorContent,
  StudioEditorProperties,
  revealStudioProperties,
} from "./studio-editor-content";
import { editorContentStyles as contentLayout } from "./studio-editor-content.styles";
import { editorLayoutStyles as layout } from "./studio-editor-layout.styles";
import {
  editorClassName as editorClass,
  editorStyles,
} from "./studio-editor.styles";
import { BodyEditor } from "./body-editor";
import { Field, FieldAssistControls, isFieldVisible } from "./entity-fields";
import {
  derivePipeline,
  editorSaveLabel,
  PipelineStations,
  SaveStateNotice,
} from "./editor-status";
import { PublicationActions } from "./publication-actions";
import { StudioConflictRecovery } from "./studio-conflict-recovery";
import { createEditorDocument } from "./editor-document";
import { StudioPageHead } from "./studio-page-head";
import { entityTitle } from "./ui-utils";

import {
  StudioFolderTrail,
  StudioDestination,
  StudioCreationLayout,
} from "./studio-hierarchy";
import { hierarchyStyles as hierarchy } from "./studio-hierarchy.styles";

import type { StudioAppViewProps } from "./app-view-props";
import type { StudioAppModel } from "./studio-app-model";

const MOBILE_EDITOR_PANES: readonly StudioAppViewProps["mobilePane"][] = [
  "details",
  "write",
  "preview",
];

export function StudioEditorPane(
  props: StudioAppViewProps & { model: StudioAppModel },
): ReactElement {
  const {
    editor,
    fieldAssistState,
    bodyMode,
    mobilePane,
    syncStatus,
    baselineCommit,
    agentTargets,
    hasUnsavedChanges,
    dispatchEditor,
    setFieldAssistState,
    setBodyMode,
    setMobilePane,
    backToList,
    performPublishingAction,
    runFieldAssist,
    applyFieldAssist,
    save,
  } = props;
  const { mode, draft, body, save: saveState } = editor;
  const {
    entitySchema,
    presentation,
    selectedEntityType,
    groupingFields,
    groupingVocabularies,
    systemDesign,
    canEdit,
    namedCreate,
    fieldIssues,
    destinationBlocked,
    hierarchyKind,
    canDelete,
    canPublish,
    canAssist,
    collectionLabel,
    publicationWorkspace,
    publicationState,
    editorHead,
  } = props.model;
  return (
    <form
      role="main"
      aria-label="Document editor"
      className={editorClass(
        "",
        layout.editor,
        presentation !== "split" && contentLayout.editor,
      )}
      data-studio-editor=""
      data-editor-presentation={presentation}
      data-mobile-pane={presentation === "split" ? mobilePane : undefined}
      onInvalidCapture={(event) => {
        revealStudioProperties(event.currentTarget);
        if (mobilePane === "details") return;
        event.preventDefault();
        const first = event.currentTarget.querySelector<
          HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
        >("input:invalid, select:invalid, textarea:invalid");
        if (event.target !== first) return;
        setMobilePane("details");
        requestAnimationFrame(() => {
          if (first.isConnected) {
            first.focus();
            first.reportValidity();
          }
        });
      }}
      onSubmit={(event) => {
        event.preventDefault();
        if (canEdit && !destinationBlocked && saveState.kind !== "saving")
          save();
      }}
      onKeyDown={(event) => {
        if (
          (event.ctrlKey || event.metaKey) &&
          !event.altKey &&
          !event.shiftKey &&
          event.key.toLowerCase() === "s"
        ) {
          if (
            event.target instanceof HTMLElement &&
            event.target.closest('[role="dialog"], [role="alertdialog"]')
          )
            return;
          event.preventDefault();
          if (canEdit && saveState.kind !== "saving")
            event.currentTarget.requestSubmit();
        }
      }}
    >
      <StudioPageHead
        model={editorHead}
        appearance="document"
        navigation={
          !entitySchema.isSingleton ? (
            <Button
              type="button"
              variant="ghost"
              onClick={backToList}
              aria-label={`Back to ${props.groupReturnLabel ?? collectionLabel}`}
            >
              <span aria-hidden="true">←</span> Back to{" "}
              {props.groupReturnLabel ?? collectionLabel}
            </Button>
          ) : undefined
        }
        action={
          canEdit || presentation === "split" ? (
            <Button
              type="submit"
              className="studio-editor-head-save"
              variant={hasUnsavedChanges ? "default" : "outline"}
              title="Save changes (Ctrl+S or ⌘S)"
              aria-keyshortcuts="Control+s Meta+s"
              disabled={
                !canEdit || destinationBlocked || saveState.kind === "saving"
              }
            >
              {saveState.kind === "saving" ? "Saving…" : "Save changes"}
            </Button>
          ) : undefined
        }
      />
      <StudioCreationLayout
        active={namedCreate}
        split={presentation === "split"}
      >
        {mode.kind === "create" && namedCreate && (
          <div
            className={editorClass(
              "",
              headStyles.inset,
              hierarchy.destinationFrame,
            )}
          >
            <StudioFolderTrail
              kind={hierarchyKind}
              collectionLabel={collectionLabel}
              collectionPath={props.collectionPath}
              query={{
                ...props.collectionQuery,
                prefix: mode.prefix ?? null,
              }}
              onNavigate={props.selectFolder}
              fixed
            />
            <StudioDestination
              kind={hierarchyKind}
              segment={mode.segment ?? ""}
              onSegmentChange={(segment) =>
                dispatchEditor({ type: "segmentChanged", segment })
              }
              preview={props.creationDestination.data}
              pending={props.creationDestination.pending}
              error={props.creationDestination.error}
              issues={saveState.kind === "error" ? saveState.issues : undefined}
            />
          </div>
        )}
        {presentation === "split" && (
          <div
            className={editorClass(
              "studio-mobile-tabs",
              editorStyles.mobileModes,
            )}
          >
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-label="Editor view"
                  className={editorClass(
                    "",
                    editorStyles.paneTrigger,
                    typographyStyles.eyebrow,
                  )}
                >
                  {mobilePane === "details"
                    ? "Properties"
                    : mobilePane === "write"
                      ? "Source"
                      : "Preview"}
                  <span aria-hidden="true">⌄</span>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                {MOBILE_EDITOR_PANES.map((pane) => (
                  <DropdownMenuItem
                    key={pane}
                    disabled={pane !== "details" && !entitySchema.hasBody}
                    onSelect={() => {
                      setMobilePane(pane);
                      if (pane === "write") setBodyMode("source");
                      if (pane === "preview") setBodyMode("preview");
                    }}
                  >
                    {pane === "details"
                      ? "Properties"
                      : pane === "write"
                        ? "Source"
                        : "Preview"}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
        <StudioEditorContent presentation={presentation}>
          {systemDesign && (
            <p
              data-studio-system-intro=""
              {...stylex.props(systemFieldStyles.intro)}
            >
              {systemDesign.intro}
            </p>
          )}
          <StudioEditorProperties
            key={`${selectedEntityType}:${mode.kind === "edit" ? mode.entity.id : "create"}`}
            presentation={presentation}
            summaryDescription={
              systemDesign
                ? entitySchema.fields
                    .slice(0, 3)
                    .map((field) => field.label)
                    .join(" · ")
                : undefined
            }
            reveal={
              (presentation === "document" && !editor.body.trim()) ||
              (fieldIssues?.length ?? 0) > 0
            }
          >
            {presentation !== "document" && !systemDesign && (
              <div className={editorClass("", editorStyles.propertiesHead)}>
                <h2
                  className={editorClass(
                    "",
                    editorStyles.propertiesLabel,
                    typographyStyles.eyebrow,
                  )}
                >
                  Properties
                </h2>
                {mode.kind === "create" || publicationState ? (
                  <span
                    className={editorClass(
                      "",
                      editorStyles.propertiesLabel,
                      typographyStyles.eyebrow,
                    )}
                  >
                    {mode.kind === "create" ? "New" : publicationState}
                  </span>
                ) : null}
              </div>
            )}
            <fieldset
              className={editorClass("", layout.fields)}
              disabled={!canEdit}
            >
              {systemDesign ? (
                <>
                  {selectedEntityType === GROUPING_VOCABULARY_TYPE && (
                    <StudioVocabularyEditor
                      groupings={props.groupings?.items ?? []}
                      value={draft["groupings"]}
                      readOnly={!canEdit}
                      issues={fieldIssues}
                      onChange={(raw) =>
                        dispatchEditor({
                          type: "fieldChanged",
                          descriptor: {
                            name: "groupings",
                            label: "Groupings",
                            widget: "object",
                          },
                          raw,
                        })
                      }
                    />
                  )}
                  <StudioSystemFields
                    vocabularies={groupingVocabularies}
                    literalFields={groupingFields}
                    suggestions={props.groupingSuggestions}
                    fields={
                      selectedEntityType === GROUPING_VOCABULARY_TYPE
                        ? entitySchema.fields.filter(
                            (field) => field.name !== "groupings",
                          )
                        : entitySchema.fields
                    }
                    draft={draft}
                    title={
                      presentation === "document"
                        ? ""
                        : systemDesign.fieldsTitle
                    }
                    readOnly={!canEdit}
                    issues={fieldIssues}
                    onChange={(descriptor, raw) =>
                      dispatchEditor({
                        type: "fieldChanged",
                        descriptor,
                        raw,
                      })
                    }
                    renderAssist={
                      canAssist &&
                      entitySchema.hasBody &&
                      body.trim().length > 0
                        ? (descriptor): ReactElement => (
                            <FieldAssistControls
                              descriptor={descriptor}
                              state={fieldAssistState}
                              onRun={runFieldAssist}
                              onApply={applyFieldAssist}
                              onDiscard={() =>
                                setFieldAssistState({ kind: "idle" })
                              }
                            />
                          )
                        : undefined
                    }
                  />
                </>
              ) : (
                entitySchema.fields
                  .filter((descriptor) => isFieldVisible(descriptor, draft))
                  .map((descriptor) => (
                    <div
                      key={`${selectedEntityType}:${mode.kind === "edit" ? mode.entity.id : "create"}:${descriptor.name}`}
                      data-studio-field-assist=""
                    >
                      <Field
                        vocabulary={groupingVocabularies[descriptor.name]}
                        literalList={groupingFields.includes(descriptor.name)}
                        suggestions={
                          props.groupingSuggestions?.[descriptor.name]
                        }
                        descriptor={descriptor}
                        issues={fieldIssues}
                        value={draft[descriptor.name]}
                        onChange={(raw) =>
                          dispatchEditor({
                            type: "fieldChanged",
                            descriptor,
                            raw,
                          })
                        }
                      />
                      {canAssist &&
                        entitySchema.hasBody &&
                        body.trim().length > 0 && (
                          <FieldAssistControls
                            descriptor={descriptor}
                            state={fieldAssistState}
                            onRun={runFieldAssist}
                            onApply={applyFieldAssist}
                            onDiscard={() =>
                              setFieldAssistState({ kind: "idle" })
                            }
                          />
                        )}
                    </div>
                  ))
              )}
              {entitySchema.format === "raw" && (
                <StudioStatus>
                  This type is raw markdown — the whole document is the body.
                </StudioStatus>
              )}
            </fieldset>
            {publicationWorkspace && mode.kind === "edit" && canPublish && (
              <PublicationActions
                entityType={selectedEntityType}
                entityId={mode.entity.id}
                title={entityTitle(mode.entity)}
                status={
                  typeof mode.entity.frontmatter["status"] === "string"
                    ? mode.entity.frontmatter["status"]
                    : "draft"
                }
                unsaved={hasUnsavedChanges}
                onAction={performPublishingAction}
              />
            )}
          </StudioEditorProperties>
          {entitySchema.hasBody && (
            <section
              className={editorClass(
                "",
                layout.manuscript,
                presentation !== "split" && contentLayout.manuscript,
              )}
            >
              {systemDesign && (
                <header {...stylex.props(systemFieldStyles.bodyHeading)}>
                  <h2 {...stylex.props(typographyStyles.secondaryDisplay)}>
                    {systemDesign.bodyTitle}
                  </h2>
                  <p {...stylex.props(systemFieldStyles.description)}>
                    {systemDesign.bodyDescription}
                  </p>
                </header>
              )}
              <BodyEditor
                value={body}
                mode={bodyMode}
                singlePane={presentation !== "split"}
                onChange={(nextBody) =>
                  dispatchEditor({ type: "bodyChanged", body: nextBody })
                }
                onModeChange={setBodyMode}
                readOnly={!canEdit}
                {...(mode.kind === "edit" && canAssist
                  ? {
                      assist: {
                        entityType: selectedEntityType,
                        entityId: mode.entity.id,
                        agents: agentTargets,
                      },
                    }
                  : {})}
              />
            </section>
          )}
        </StudioEditorContent>
      </StudioCreationLayout>
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
                  baselineCommit,
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
                onClick={() => dispatchEditor({ type: "deleteRequested" })}
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
                    onSelect={() => dispatchEditor({ type: "deleteRequested" })}
                  >
                    Delete entry
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </span>
          </>
        )}
      </footer>
    </form>
  );
}
