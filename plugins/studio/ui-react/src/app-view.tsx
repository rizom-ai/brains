/** @jsxImportSource react */
import * as stylex from "@stylexjs/stylex";
import { StudioSystemFields } from "./studio-system-fields";
import { systemFieldStyles } from "./studio-system-fields.styles";
import {
  Button,
  ConfirmDialog,
  buttonClassName,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@brains/app-ui-react";
import {
  OperatorActionButton,
  OperatorViewRenderer,
} from "@brains/operator-view-react";
import type { ReactElement, ReactNode } from "react";
import { workspaceClassName } from "./studio-workspace.styles";
import { headStyles } from "./studio-page-head.styles";
import { typographyStyles } from "./studio-typography.styles";
import { libraryStyles as library } from "./studio-library.styles";
import { StudioStatus } from "./studio-status";
import {
  StudioEditorContent,
  StudioEditorProperties,
  revealStudioProperties,
} from "./studio-editor-content";
import { editorContentStyles as contentLayout } from "./studio-editor-content.styles";
import { editorLayoutStyles as layout } from "./studio-editor-layout.styles";
import {
  accountClass,
  accountStyles as accountLayout,
} from "./studio-account.styles";
import { useStudioNavigationCollapsed } from "./studio-navigation-state";
import {
  editorClassName as editorClass,
  editorStyles,
} from "./studio-editor.styles";
import { STUDIO_OPERATOR_COMPONENTS } from "./app-controls";
import type { EntityTypeInfo, StudioWorkspaceInfo, TypeSchema } from "./api";
import { BodyEditor } from "./body-editor";
import type { StudioWorkspaceQuery } from "./queries";
import {
  Field,
  FieldAssistControls,
  isFieldVisible,
  TypeSwitcher,
  typeHasPublicationField,
} from "./entity-fields";
import {
  DeleteDialog,
  derivePipeline,
  editorSaveLabel,
  PipelineStations,
  SaveStateNotice,
} from "./editor-status";
import { PublicationActions } from "./publication-actions";
import { StudioConflictRecovery } from "./studio-conflict-recovery";
import { createEditorDocument } from "./editor-document";
import { StudioChrome } from "./studio-chrome";
import {
  navigationClassName as navClass,
  navigationStyles as nav,
} from "./studio-navigation.styles";
import { StudioPageHead } from "./studio-page-head";
import { entityPublicationState, entityTitle, formatUpdated } from "./ui-utils";

import {
  StudioCollectionControls,
  StudioCollectionPager,
} from "./studio-collection-controls";
import {
  StudioFolderTrail,
  StudioFolderRows,
  StudioDestination,
  StudioCreationLayout,
  folderLabel,
} from "./studio-hierarchy";
import { hierarchyStyles as hierarchy } from "./studio-hierarchy.styles";

import type { MobileEditorPane, StudioAppViewProps } from "./app-view-props";
import { deriveStudioAppModel, workspaceRailBadges } from "./studio-app-model";

export type { MobileEditorPane, StudioAppViewProps } from "./app-view-props";

/** Pane preferences are presentation-only and stay in the mounted app. */
export function mobileEditorEntry(
  schema: Pick<TypeSchema, "format" | "hasBody">,
  preferred: MobileEditorPane | null,
): MobileEditorPane {
  if (!schema.hasBody) return "details";
  return preferred ?? (schema.format === "raw" ? "preview" : "details");
}

const MOBILE_EDITOR_PANES: readonly MobileEditorPane[] = [
  "details",
  "write",
  "preview",
];

export function StudioAppStatus(props: {
  message: string;
  error?: boolean;
  onRetry?: () => void;
  onHome?: () => void;
}): ReactElement {
  return (
    <div
      className={editorClass(
        "studio",
        library.frame,
        typographyStyles.operatorRoles,
      )}
      data-studio-shell=""
    >
      <StudioChrome contextLabel="Studio" />
      <main aria-label="Studio status">
        <StudioStatus
          tone={props.error ? "error" : undefined}
          className={editorClass("", library.boot)}
        >
          {props.message}
          {props.onRetry && (
            <Button type="button" variant="ghost" onClick={props.onRetry}>
              Retry
            </Button>
          )}
          {props.onHome && (
            <Button type="button" variant="ghost" onClick={props.onHome}>
              Open Studio
            </Button>
          )}
        </StudioStatus>
      </main>
    </div>
  );
}

export function StudioAccountWorkspaceView(props: {
  types: EntityTypeInfo[];
  workspaces: StudioWorkspaceInfo[];
  workspaceId: string;
  selectEntityType: (entityType: string) => void;
  selectWorkspace: (workspaceId: string) => void;
  children: ReactNode;
}): ReactElement {
  const navigationCollapsed = useStudioNavigationCollapsed();
  return (
    <div
      className={editorClass(
        "studio",
        library.frame,
        typographyStyles.operatorRoles,
      )}
      data-view="account"
      data-studio-shell=""
    >
      <StudioChrome
        contextLabel="Account"
        navigation={{
          types: props.types,
          workspaces: props.workspaces,
          activeEntityType: null,
          activeWorkspaceId: props.workspaceId,
          workspaceBadges: workspaceRailBadges(props.workspaces),
          selectEntityType: props.selectEntityType,
          selectWorkspace: props.selectWorkspace,
        }}
      />
      <div
        className={navClass(
          "",
          layout.body,
          nav.shell,
          navigationCollapsed && nav.shellCollapsed,
        )}
        data-studio-body=""
      >
        <aside className={navClass("rail", nav.rail)}>
          <TypeSwitcher
            renderMode="desktop"
            types={props.types}
            active={null}
            onSelect={props.selectEntityType}
            workspaces={props.workspaces}
            activeWorkspace={props.workspaceId}
            workspaceBadges={workspaceRailBadges(props.workspaces)}
            onSelectWorkspace={props.selectWorkspace}
          />
        </aside>
        <main
          className={accountClass("account-studio-pane", accountLayout.pane)}
        >
          {props.children}
        </main>
      </div>
    </div>
  );
}

export function StudioAppView(props: StudioAppViewProps): ReactElement {
  const navigationCollapsed = useStudioNavigationCollapsed();
  const {
    activeWorkspaceId,
    types,
    workspaces,
    workspaceError,
    declarativeWorkspaceData,
    workspaceQuery,
    entityType,
    entities,
    entityOffset,
    entityLimit,
    entityTotal,
    entityListLoading,
    schema,
    editor,
    fieldAssistState,
    bodyMode,
    mobilePane,
    syncStatus,
    baselineCommit,
    agentTargets,
    deleting,
    hasUnsavedChanges,
    navigationBlocked,
    dispatchEditor,
    setFieldAssistState,
    setBodyMode,
    setMobilePane,
    backToList,
    selectEntityType,
    selectWorkspace,
    changeEntityPage,
    openWorkspaceEntity,
    openWorkspaceLaunch,
    performPublishingAction,
    performDeclarativeAction,
    onWorkspaceQueryChange,
    startCreate,
    openEntity,
    runFieldAssist,
    applyFieldAssist,
    save,
    remove,
    onNavigationReset,
    onNavigationProceed,
  } = props;
  const { mode, draft, body, save: saveState, deleteOpen } = editor;
  const model = deriveStudioAppModel(props);
  const {
    activeType,
    entitySchema,
    presentation,
    selectedEntityType,
    systemDesign,
    editing,
    canCreate,
    canEdit,
    namedCreate,
    fieldIssues,
    destinationBlocked,
    hierarchyKind,
    folderContext,
    canDelete,
    canPublish,
    canAssist,
    collectionLabel,
    entryLabel,
    publicationWorkspace,
    pageEnd,
    workspaceBadges,
    collectionFiltered,
    listingHead,
    publicationState,
    editorHead,
    declarativeHead,
  } = model;
  return (
    <div
      className={editorClass(
        "studio",
        library.frame,
        typographyStyles.operatorRoles,
      )}
      data-studio-shell=""
      data-view={
        activeWorkspaceId ? "workspace" : editing ? "editor" : "listing"
      }
    >
      <StudioChrome
        contextLabel={collectionLabel}
        navigation={{
          types,
          workspaces,
          activeEntityType: activeWorkspaceId ? null : entityType,
          activeWorkspaceId,
          workspaceBadges,
          selectEntityType,
          selectWorkspace,
        }}
      />
      <div
        className={navClass(
          "",
          layout.body,
          nav.shell,
          navigationCollapsed && nav.shellCollapsed,
        )}
        data-studio-body=""
      >
        <aside className={navClass("rail", nav.rail)}>
          <TypeSwitcher
            renderMode="desktop"
            types={types}
            active={activeWorkspaceId ? null : entityType}
            onSelect={selectEntityType}
            workspaces={workspaces}
            activeWorkspace={activeWorkspaceId}
            workspaceBadges={workspaceRailBadges(workspaces)}
            onSelectWorkspace={selectWorkspace}
          />
        </aside>
        {activeWorkspaceId ? (
          workspaceError && !declarativeWorkspaceData ? (
            <main className={workspaceClassName("")}>
              <StudioStatus tone="error">
                {workspaceError}
                <Button
                  type="button"
                  variant="ghost"
                  onClick={props.onRetryRead}
                >
                  Retry
                </Button>
              </StudioStatus>
            </main>
          ) : declarativeWorkspaceData && declarativeHead ? (
            <div className={workspaceClassName("studio-workspace-frame")}>
              {workspaceError && (
                <StudioStatus tone="error">
                  Showing previously loaded content. {workspaceError}
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={props.onRetryRead}
                  >
                    Retry
                  </Button>
                </StudioStatus>
              )}
              <StudioPageHead
                model={declarativeHead}
                {...(declarativeHead.primaryAction
                  ? {
                      action: (
                        <OperatorActionButton
                          action={declarativeHead.primaryAction}
                          primary
                          onAction={performDeclarativeAction}
                          components={STUDIO_OPERATOR_COMPONENTS}
                        />
                      ),
                    }
                  : {})}
              />
              <OperatorViewRenderer
                key={activeWorkspaceId}
                data={declarativeWorkspaceData}
                components={STUDIO_OPERATOR_COMPONENTS}
                renderHead={false}
                onOpenEntity={openWorkspaceEntity}
                onLaunch={openWorkspaceLaunch}
                onAction={performDeclarativeAction}
                query={workspaceQuery}
                {...(activeWorkspaceId
                  ? {
                      onQueryChange: (query: StudioWorkspaceQuery) =>
                        onWorkspaceQueryChange(activeWorkspaceId, query, query),
                    }
                  : {})}
              />
            </div>
          ) : null
        ) : !editing ? (
          <main
            className={editorClass(
              "",
              library.listing,
              headStyles.inset,
              canCreate && hierarchy.withMobileBar,
            )}
            data-studio-library=""
            aria-busy={entityListLoading}
          >
            {props.readError && (
              <StudioStatus tone="error">
                {entities?.length ? "Showing previously loaded entries. " : ""}
                {props.readError}
                <Button
                  type="button"
                  variant="ghost"
                  onClick={props.onRetryRead}
                >
                  Retry
                </Button>
              </StudioStatus>
            )}
            <StudioPageHead
              model={listingHead}
              action={
                (!systemDesign || canCreate) && (
                  <Button
                    type="button"
                    disabled={!canCreate || !schema}
                    data-studio-library-new=""
                    xstyle={hierarchy.desktopCreateAction}
                    onClick={startCreate}
                  >
                    New {entryLabel.toLowerCase()}
                  </Button>
                )
              }
            />
            {systemDesign && (
              <p
                data-studio-system-intro=""
                {...stylex.props(systemFieldStyles.collectionIntro)}
              >
                {systemDesign.intro}
              </p>
            )}
            <StudioFolderTrail
              kind={hierarchyKind}
              collectionLabel={collectionLabel}
              collectionPath={props.collectionPath}
              query={props.collectionQuery}
              onNavigate={props.selectFolder}
            />
            {!entitySchema.isSingleton && (
              <StudioCollectionControls
                kind={hierarchyKind}
                query={props.collectionQuery}
                fields={entitySchema.fields}
                total={entityTotal}
                onChange={props.onCollectionQueryChange}
              />
            )}
            {!entityListLoading && (
              <StudioFolderRows
                kind={hierarchyKind}
                folders={props.folders}
                collectionPath={props.collectionPath}
                query={props.collectionQuery}
                onNavigate={props.selectFolder}
              />
            )}
            {props.folders.length > 0 && entityTotal > 0 && (
              <div className={editorClass("", hierarchy.label)}>
                <span>Entries here</span>
                <span>{entityTotal}</span>
              </div>
            )}
            {!entitySchema.isSingleton && entityTotal > 0 && (
              <StudioCollectionPager
                label={`${activeType?.label ?? "Entity"} pagination`}
                offset={entityOffset}
                count={Math.max(0, pageEnd - entityOffset)}
                total={entityTotal}
                loading={entityListLoading}
                hasNext={entityOffset + entityLimit < entityTotal}
                onPrevious={() =>
                  changeEntityPage(Math.max(0, entityOffset - entityLimit))
                }
                onNext={() => changeEntityPage(entityOffset + entityLimit)}
              />
            )}
            {entityListLoading && (
              <StudioStatus className={editorClass("", library.empty)}>
                Loading entries…
              </StudioStatus>
            )}
            {!entityListLoading &&
              (entities ?? []).map((entity, index) => (
                <button
                  type="button"
                  key={entity.id}
                  className={editorClass(
                    "",
                    library.row,
                    editorStyles.listingRow,
                    systemDesign && systemFieldStyles.collectionRow,
                  )}
                  data-studio-record=""
                  onClick={() => openEntity(entity.id)}
                >
                  {!systemDesign && (
                    <span className={editorClass("", library.index)}>
                      {String(entityOffset + index + 1).padStart(2, "0")}
                    </span>
                  )}
                  <span
                    className={editorClass(
                      "",
                      library.title,
                      systemDesign && systemFieldStyles.collectionTitle,
                    )}
                    title={entity.id}
                  >
                    {entityTitle(entity, entity.path?.at(-1))}
                    {(props.collectionQuery.q ||
                      props.collectionQuery.scope === "collection") &&
                      entity.path &&
                      entity.path.length > 1 && (
                        <span className={editorClass("", hierarchy.context)}>
                          {entity.path
                            .slice(0, -1)
                            .map(folderLabel)
                            .join(" / ")}
                        </span>
                      )}
                    {systemDesign && (
                      <span {...stylex.props(systemFieldStyles.collectionMeta)}>
                        {entryLabel} ·{" "}
                        <time dateTime={entity.updated} title={entity.updated}>
                          {formatUpdated(entity.updated)}
                        </time>
                      </span>
                    )}
                    {typeHasPublicationField(entitySchema.fields) && (
                      <span
                        className={editorClass(
                          "studio-publication-state",
                          editorStyles.publication,
                        )}
                      >
                        {entityPublicationState(entity)}
                      </span>
                    )}
                  </span>
                  {systemDesign ? (
                    <span aria-hidden="true">→</span>
                  ) : (
                    <time
                      className={editorClass("", library.updated)}
                      dateTime={entity.updated}
                      title={entity.updated}
                    >
                      {formatUpdated(entity.updated)}
                    </time>
                  )}
                </button>
              ))}
            {!props.readError &&
              !entityListLoading &&
              entities?.length === 0 &&
              props.folders.length === 0 && (
                <StudioStatus className={editorClass("", library.empty)}>
                  {props.collectionQuery.q ||
                  props.collectionQuery.status ||
                  props.collectionQuery.visibility !== "all"
                    ? "No entries match these filters. Clear or change the filters to try again."
                    : canCreate
                      ? "Nothing here yet — start the first entry."
                      : "No entries are available in this collection."}
                  {collectionFiltered &&
                    props.collectionQuery.prefix &&
                    props.collectionQuery.scope === "folder" && (
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() =>
                          props.onCollectionQueryChange({
                            ...props.collectionQuery,
                            scope: "collection",
                            offset: 0,
                          })
                        }
                      >
                        Search whole collection
                      </Button>
                    )}
                </StudioStatus>
              )}
            {canCreate && (
              <div
                data-studio-folder-action
                className={editorClass("", hierarchy.mobileBar)}
              >
                <span>
                  Creating in <strong>{folderContext}</strong>
                </span>
                <Button type="button" onClick={startCreate} disabled={!schema}>
                  New {entryLabel.toLowerCase()}
                </Button>
              </div>
            )}
          </main>
        ) : (
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
                    aria-label={`Back to ${collectionLabel}`}
                  >
                    <span aria-hidden="true">←</span> Back to {collectionLabel}
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
                      !canEdit ||
                      destinationBlocked ||
                      saveState.kind === "saving"
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
                    issues={
                      saveState.kind === "error" ? saveState.issues : undefined
                    }
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
                    <div
                      className={editorClass("", editorStyles.propertiesHead)}
                    >
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
                      <StudioSystemFields
                        fields={entitySchema.fields}
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
                    ) : (
                      entitySchema.fields
                        .filter((descriptor) =>
                          isFieldVisible(descriptor, draft),
                        )
                        .map((descriptor) => (
                          <div
                            key={`${selectedEntityType}:${mode.kind === "edit" ? mode.entity.id : "create"}:${descriptor.name}`}
                            data-studio-field-assist=""
                          >
                            <Field
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
                        This type is raw markdown — the whole document is the
                        body.
                      </StudioStatus>
                    )}
                  </fieldset>
                  {publicationWorkspace &&
                    mode.kind === "edit" &&
                    canPublish && (
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
                        <h2
                          {...stylex.props(typographyStyles.secondaryDisplay)}
                        >
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
              className={editorClass(
                "",
                editorStyles.pipeline,
                layout.pipeline,
              )}
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
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={props.onRetryRead}
                    >
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
              {mode.kind === "edit" &&
                !entitySchema.isSingleton &&
                canDelete && (
                  <>
                    <span className={editorClass("", layout.desktop)}>
                      <Button
                        type="button"
                        variant="danger"
                        xstyle={layout.danger}
                        onClick={() =>
                          dispatchEditor({ type: "deleteRequested" })
                        }
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
                            onSelect={() =>
                              dispatchEditor({ type: "deleteRequested" })
                            }
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
        )}
      </div>
      {deleteOpen && mode.kind === "edit" && canDelete && (
        <DeleteDialog
          entityId={mode.entity.id}
          deleting={deleting}
          onCancel={() => dispatchEditor({ type: "deleteCancelled" })}
          onConfirm={remove}
        />
      )}
      {navigationBlocked && (
        <ConfirmDialog
          mark="↩"
          title="Discard unsaved changes?"
          titleId="discard-navigation-title"
          cancelLabel="Keep editing"
          confirmLabel="Discard and continue"
          confirmVariant="danger"
          onCancel={onNavigationReset}
          onConfirm={onNavigationProceed}
        >
          <p>
            This draft has not been saved. Continue only if you want to leave it
            behind.
          </p>
        </ConfirmDialog>
      )}
    </div>
  );
}
