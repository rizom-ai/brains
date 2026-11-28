/** @jsxImportSource react */
import * as stylex from "@stylexjs/stylex";
import { Button } from "@brains/app-ui-react";
import { useEffect, useRef, type FormEvent, type ReactElement } from "react";
import type { StudioAppViewProps } from "./app-view-props";
import { BodyEditor } from "./body-editor";
import {
  STUDIO_SAVE_REASON_ID,
  editorSaveBlockReason,
  isEditorSaveBlocked,
} from "./editor-save-rule";
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
import { StudioAskToggle } from "./studio-ask-toggle";
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
import { StudioCollectionMembers } from "./studio-collection-members";
import { headStyles } from "./studio-page-head.styles";
import { systemFieldStyles } from "./studio-system-fields.styles";
import { typographyStyles } from "./studio-typography.styles";
import { entityTitle } from "./ui-utils";
import { useInspectorPreference } from "./use-inspector-preference";
import { StudioStatus } from "./studio-status";
import { StudioShortcuts } from "./studio-shortcuts";
import { FieldIssueSource } from "./field-issue-source";
import { StudioDocumentMenu, StudioSyncDetails } from "./studio-document-menu";
import { HeadingTitle, headingTitleField } from "./heading-title";

export function StudioEditorPane(
  props: StudioAppViewProps & { model: StudioAppModel },
): ReactElement {
  const {
    editor,
    bodyMode,
    mobilePane,
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
  const saveBlockReason = editorSaveBlockReason(
    editor,
    props.model,
    hasUnsavedChanges,
  );
  // A singleton is one settings document, saved rather than created.
  const creating = mode.kind === "create" && !entitySchema.isSingleton;
  // Beside a document, Properties are an inspector that can be put away.
  const inspecting = presentation === "split";
  const [inspectorHidden, setInspectorHidden] =
    useInspectorPreference(selectedEntityType);
  // A document's title is its heading, edited in place.
  const titleField = canEdit
    ? headingTitleField(entitySchema, presentation)
    : undefined;
  const titleValue =
    typeof editor.draft["title"] === "string" ? editor.draft["title"] : "";
  const titleEditor = titleField ? (
    <HeadingTitle
      descriptor={titleField}
      value={titleValue}
      placeholder={`Untitled ${props.model.entryLabel.toLowerCase()}`}
      issues={fieldIssues}
      onChange={(value) =>
        dispatchEditor({
          type: "fieldChanged",
          descriptor: titleField,
          raw: value,
        })
      }
    />
  ) : undefined;

  // An invalid field on a hidden phone pane would fail silently, so the
  // Properties pane opens and the first invalid field takes focus.
  function revealFirstInvalid(event: FormEvent<HTMLFormElement>): void {
    // The heading's title is always in view: the browser focuses it itself.
    const firstInvalid = event.currentTarget.querySelector(
      "input:invalid, select:invalid, textarea:invalid",
    );
    if (firstInvalid && !firstInvalid.closest("[data-studio-properties]"))
      return;
    revealStudioProperties(event.currentTarget);
    const inspectorWasHidden = inspecting && inspectorHidden;
    if (mobilePane === "details" && !inspectorWasHidden) return;
    event.preventDefault();
    const first = event.currentTarget.querySelector<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    >("input:invalid, select:invalid, textarea:invalid");
    if (event.target !== first) return;
    setMobilePane("details");
    if (inspectorWasHidden) setInspectorHidden(false);
    requestAnimationFrame(() => {
      if (first.isConnected) {
        first.focus();
        first.reportValidity();
      }
    });
  }

  const formRef = useRef<HTMLFormElement>(null);
  // The shortcuts work wherever focus is while the entry is open, so Ctrl/⌘+S
  // never falls through to the browser's "Save page".
  useEffect(() => {
    document.addEventListener("keydown", saveOnShortcut);
    return (): void => document.removeEventListener("keydown", saveOnShortcut);
  });

  function saveOnShortcut(event: KeyboardEvent): void {
    if (
      inspecting &&
      (event.ctrlKey || event.metaKey) &&
      !event.altKey &&
      !event.shiftKey &&
      event.key === "\\"
    ) {
      event.preventDefault();
      setInspectorHidden(!inspectorHidden);
      return;
    }
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
    if (!saveBlocked) formRef.current?.requestSubmit();
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
      data-inspector={
        inspecting ? (inspectorHidden ? "hidden" : "shown") : undefined
      }
      onInvalidCapture={revealFirstInvalid}
      onSubmit={(event) => {
        event.preventDefault();
        if (!saveBlocked) save();
      }}
      ref={formRef}
    >
      <FieldIssueSource value={saveState.kind === "error" ? "save" : "check"}>
        <StudioPageHead
          model={editorHead}
          appearance="document"
          titleEditor={titleEditor}
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
              <>
                {props.ask && mode.kind === "edit" && canAssist && (
                  <StudioAskToggle ask={props.ask} placement="head" />
                )}
                {inspecting && (
                  <Button
                    type="button"
                    variant="ghost"
                    className="studio-inspector-toggle"
                    xstyle={layout.inspectorToggle}
                    aria-pressed={!inspectorHidden}
                    aria-keyshortcuts="Control+Backslash Meta+Backslash"
                    title="Details (Ctrl+\\ or ⌘\\)"
                    onClick={() => setInspectorHidden(!inspectorHidden)}
                  >
                    Details
                  </Button>
                )}
                <Button
                  type="submit"
                  className="studio-editor-head-save"
                  variant={hasUnsavedChanges ? "default" : "outline"}
                  title={`${creating ? "Create" : "Save changes"} (Ctrl+S or ⌘S)`}
                  aria-keyshortcuts="Control+s Meta+s"
                  disabled={saveBlocked}
                  {...(saveBlockReason && {
                    "aria-describedby": STUDIO_SAVE_REASON_ID,
                  })}
                >
                  {saveState.kind === "saving"
                    ? creating
                      ? "Creating…"
                      : "Saving…"
                    : creating
                      ? "Create"
                      : "Save changes"}
                </Button>
                {mode.kind === "edit" &&
                  !entitySchema.isSingleton &&
                  props.model.canDelete && (
                    <StudioDocumentMenu
                      onDelete={() =>
                        dispatchEditor({ type: "deleteRequested" })
                      }
                    />
                  )}
              </>
            ) : undefined
          }
        />
        {props.draftRecovery?.offer && (
          <div data-studio-draft-offer="">
            <StudioStatus className={editorClass("", headStyles.inset)}>
              Unsaved changes from{" "}
              <time
                dateTime={new Date(
                  props.draftRecovery.offer.savedAt,
                ).toISOString()}
              >
                {new Date(props.draftRecovery.offer.savedAt).toLocaleString(
                  undefined,
                  { dateStyle: "medium", timeStyle: "short" },
                )}
              </time>{" "}
              were kept in this browser.{" "}
              <Button
                type="button"
                variant="outline"
                onClick={props.draftRecovery.restore}
              >
                Restore
              </Button>{" "}
              <Button
                type="button"
                variant="ghost"
                onClick={props.draftRecovery.discard}
              >
                Discard
              </Button>
            </StudioStatus>
          </div>
        )}
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
                followsTitle={
                  titleField !== undefined && mode.segmentFollowsTitle === true
                }
                onSegmentChange={(segment) =>
                  dispatchEditor({ type: "segmentChanged", segment })
                }
                preview={props.creationDestination.data}
                pending={props.creationDestination.pending}
                error={props.creationDestination.error}
                issues={
                  saveState.kind === "error" ? saveState.issues : undefined
                }
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
              hidden={inspecting && inspectorHidden}
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
              <StudioSyncDetails
                syncStatus={props.syncStatus}
                baselineCommit={props.baselineCommit}
                editor={editor}
              />
              {publicationWorkspace && mode.kind === "edit" && canPublish && (
                <PublicationActions
                  entityType={selectedEntityType}
                  entityId={mode.entity.id}
                  title={entityTitle(mode.entity)}
                  missing={(
                    props.model.activeType?.publishRequires ?? []
                  ).filter((field) => {
                    const value = mode.entity.frontmatter[field];
                    return (
                      value === undefined ||
                      value === null ||
                      (typeof value === "string" && value.trim() === "")
                    );
                  })}
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
                  documentTitle={titleField ? titleValue : editorHead.title}
                  onSelectionChange={props.ask?.setSelection}
                />
                {/* A collection lists what it holds below its document. */}
                {mode.kind === "edit" && props.model.activeType?.collection && (
                  <StudioCollectionMembers
                    entityType={selectedEntityType}
                    entityId={mode.entity.id}
                    onOpen={props.openEntity}
                  />
                )}
              </section>
            )}
          </StudioEditorContent>
        </StudioCreationLayout>
        <StudioEditorSaveBar {...props} />
        <StudioShortcuts />
      </FieldIssueSource>
    </form>
  );
}
