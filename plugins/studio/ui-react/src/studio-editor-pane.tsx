/** @jsxImportSource react */
import * as stylex from "@stylexjs/stylex";
import { Button } from "@brains/app-ui-react";
import type { FormEvent, KeyboardEvent, ReactElement } from "react";
import type { StudioAppViewProps } from "./app-view-props";
import { BodyEditor } from "./body-editor";
import { isEditorSaveBlocked } from "./editor-save-rule";
import { editorDocumentKey } from "./editor-workflow";
import { PublicationActions } from "./publication-actions";
import type { StudioAppModel } from "./studio-app-model";
import {
  StudioEditorContent,
  StudioEditorProperties,
  revealStudioProperties,
} from "./studio-editor-content";
import { editorContentStyles as contentLayout } from "./studio-editor-content.styles";
import { StudioEditorFields } from "./studio-editor-fields";
import { editorLayoutStyles as layout } from "./studio-editor-layout.styles";
import { StudioEditorPaneMenu } from "./studio-editor-pane-menu";
import { StudioEditorSaveBar } from "./studio-editor-save-bar";
import {
  editorClassName as editorClass,
  editorStyles,
} from "./studio-editor.styles";
import {
  StudioCreationLayout,
  StudioDestination,
  StudioFolderTrail,
} from "./studio-hierarchy";
import { hierarchyStyles as hierarchy } from "./studio-hierarchy.styles";
import { StudioPageHead } from "./studio-page-head";
import { headStyles } from "./studio-page-head.styles";
import { systemFieldStyles } from "./studio-system-fields.styles";
import { typographyStyles } from "./studio-typography.styles";
import { entityTitle } from "./ui-utils";

export function StudioEditorPane(
  props: StudioAppViewProps & { model: StudioAppModel },
): ReactElement {
  const {
    editor,
    bodyMode,
    mobilePane,
    agentTargets,
    hasUnsavedChanges,
    dispatchEditor,
    setBodyMode,
    setMobilePane,
    backToList,
    performPublishingAction,
    save,
  } = props;
  const { mode, body, save: saveState } = editor;
  const {
    entitySchema,
    presentation,
    selectedEntityType,
    systemDesign,
    canEdit,
    namedCreate,
    fieldIssues,
    hierarchyKind,
    canPublish,
    canAssist,
    collectionLabel,
    publicationWorkspace,
    publicationState,
    editorHead,
  } = props.model;
  const saveBlocked = isEditorSaveBlocked(
    editor,
    props.model,
    hasUnsavedChanges,
  );

  // An invalid field on a hidden phone pane would fail silently, so the
  // Properties pane opens and the first invalid field takes focus.
  function revealFirstInvalid(event: FormEvent<HTMLFormElement>): void {
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
  }

  function saveOnShortcut(event: KeyboardEvent<HTMLFormElement>): void {
    if (
      !(event.ctrlKey || event.metaKey) ||
      event.altKey ||
      event.shiftKey ||
      event.key.toLowerCase() !== "s"
    )
      return;
    if (
      event.target instanceof HTMLElement &&
      event.target.closest('[role="dialog"], [role="alertdialog"]')
    )
      return;
    event.preventDefault();
    if (!saveBlocked) event.currentTarget.requestSubmit();
  }
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
      onInvalidCapture={revealFirstInvalid}
      onSubmit={(event) => {
        event.preventDefault();
        if (!saveBlocked) save();
      }}
      onKeyDown={saveOnShortcut}
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
              disabled={saveBlocked}
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
          <StudioEditorPaneMenu
            pane={mobilePane}
            hasBody={entitySchema.hasBody}
            onPane={setMobilePane}
            onBodyMode={setBodyMode}
          />
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
            key={editorDocumentKey(selectedEntityType, mode)}
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
            <StudioEditorFields {...props} />
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
      <StudioEditorSaveBar {...props} />
    </form>
  );
}
