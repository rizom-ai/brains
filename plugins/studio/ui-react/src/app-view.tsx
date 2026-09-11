/** @jsxImportSource react */
import type {
  RuntimeStudioWorkspaceData,
  RuntimeOperatorActionControl,
  RuntimeOperatorLaunchIntent,
} from "@brains/plugins";
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
import type { Dispatch, ReactElement, ReactNode, SetStateAction } from "react";
import { workspaceClassName } from "./studio-workspace.styles";
import { libraryStyles as library } from "./studio-library.styles";
import { StudioStatus } from "./studio-status";
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
import type {
  AgentTarget,
  StudioWorkspaceInfo,
  EntitySummary,
  EntityTypeInfo,
  PublishingAction,
  PublishingActionResult,
  SyncStatus,
  TypeSchema,
} from "./api";
import { BodyEditor, type BodyMode } from "./body-editor";
import type { StudioWorkspaceQuery } from "./queries";
import {
  Field,
  FieldAssistControls,
  isFieldVisible,
  TypeSwitcher,
  studioArea,
  typeHasPublicationField,
  type FieldAssistState,
  type FieldAssistVariant,
} from "./entity-fields";
import type {
  EditorWorkflowAction,
  EditorWorkflowState,
} from "./editor-workflow";
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
import {
  declarativeStudioPageHead,
  StudioPageHead,
  studioAccessRequirement,
  type StudioPageHeadModel,
} from "./studio-page-head";
import {
  entityPublicationState,
  entityTitle,
  formatUpdated,
  singularLabel,
} from "./ui-utils";

export type MobileEditorPane = "details" | "write" | "preview";

const EMPTY_TYPE_SCHEMA: TypeSchema = {
  entityType: "",
  format: "frontmatter",
  isSingleton: false,
  hasBody: false,
  fields: [],
};
const MOBILE_EDITOR_PANES: readonly MobileEditorPane[] = [
  "details",
  "write",
  "preview",
];

export interface StudioAppViewProps {
  activeWorkspaceId: string | null;
  types: EntityTypeInfo[];
  workspaces: StudioWorkspaceInfo[];
  workspaceError: string | null;
  readError?: string | null;
  onRetryRead?: () => void;
  declarativeWorkspaceData: RuntimeStudioWorkspaceData | null;
  workspaceQuery: StudioWorkspaceQuery;
  entityType: string | null;
  entities: EntitySummary[] | null;
  entityOffset: number;
  entityLimit: number;
  entityTotal: number;
  entityListLoading: boolean;
  schema: TypeSchema | null;
  editor: EditorWorkflowState;
  fieldAssistState: FieldAssistState;
  bodyMode: BodyMode;
  mobilePane: MobileEditorPane;
  syncStatus: SyncStatus | null;
  baselineCommit: string | null;
  agentTargets: AgentTarget[];
  deleting: boolean;
  hasUnsavedChanges: boolean;
  navigationBlocked: boolean;
  dispatchEditor: Dispatch<EditorWorkflowAction>;
  setFieldAssistState: Dispatch<SetStateAction<FieldAssistState>>;
  setBodyMode: Dispatch<SetStateAction<BodyMode>>;
  setMobilePane: Dispatch<SetStateAction<MobileEditorPane>>;
  backToList: () => void;
  selectEntityType: (entityType: string) => void;
  selectWorkspace: (workspaceId: string) => void;
  changeEntityPage: (offset: number) => void;
  openWorkspaceEntity: (entityType: string, entityId: string) => void;
  openWorkspaceLaunch: (launch: RuntimeOperatorLaunchIntent) => void;
  performPublishingAction: (
    action: PublishingAction,
  ) => Promise<PublishingActionResult>;
  performDeclarativeAction: (
    action: RuntimeOperatorActionControl,
  ) => Promise<unknown>;
  onWorkspaceQueryChange: (
    workspaceId: string,
    query: StudioWorkspaceQuery,
    canonicalUrlQuery?: StudioWorkspaceQuery,
  ) => void;
  startCreate: () => void;
  openEntity: (entityId: string) => void;
  runFieldAssist: (variant: FieldAssistVariant, field: string) => void;
  applyFieldAssist: (field: string, suggestion: string | string[]) => void;
  save: () => void;
  remove: () => void;
  onNavigationReset: () => void;
  onNavigationProceed: () => void;
}

function workspaceRailBadges(
  workspaces: StudioWorkspaceInfo[],
): Record<string, number> {
  return Object.fromEntries(
    workspaces.flatMap((workspace) =>
      workspace.badge === undefined ? [] : [[workspace.id, workspace.badge]],
    ),
  );
}

export function StudioAppStatus(props: {
  message: string;
  error?: boolean;
  onRetry?: () => void;
}): ReactElement {
  return (
    <div className={editorClass("studio", library.frame)} data-studio-shell="">
      <StudioChrome contextLabel="Studio" />
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
      </StudioStatus>
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
      className={editorClass("studio", library.frame)}
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
  const activeType = types.find((info) => info.entityType === entityType);
  const activeWorkspace = workspaces.find(
    (workspace) => workspace.id === activeWorkspaceId,
  );

  // Workspace branches do not read these entity fallbacks.
  const entitySchema = schema ?? EMPTY_TYPE_SCHEMA;
  const selectedEntityType = entityType ?? "";
  const editing = !activeWorkspaceId && mode.kind !== "browse";
  const canCreate = activeType?.capabilities.canCreate === true;
  const canEdit =
    mode.kind === "create"
      ? canCreate
      : mode.kind === "edit" && activeType?.capabilities.canUpdate === true;
  const canDelete = activeType?.capabilities.canDelete === true;
  const canPublish = activeType?.capabilities.canPublish === true;
  const canAssist = canEdit && activeType?.capabilities.canAssist === true;
  const heading =
    mode.kind === "edit"
      ? activeType?.isSingleton
        ? singularLabel(activeType.label)
        : entityTitle(mode.entity)
      : mode.kind === "create"
        ? `New ${activeType?.label ?? entityType}`
        : (activeType?.label ?? entityType);
  const collectionLabel =
    activeWorkspace?.label ??
    (activeType?.isSingleton
      ? singularLabel(activeType.label)
      : activeType?.label) ??
    entityType ??
    "Studio";
  const entryLabel = singularLabel(collectionLabel);
  const syncPending = syncStatus?.git?.hasChanges === true;
  const publicationWorkspace = workspaces.find(
    (workspace) =>
      workspace.pluginId === "content-pipeline" &&
      workspace.entityTypes.includes(selectedEntityType),
  );
  const entityCount = entityTotal;
  const pageEnd = Math.min(
    entityOffset + (entities?.length ?? entityLimit),
    entityTotal,
  );
  const workspaceBadges = workspaceRailBadges(workspaces);
  const listingHead: StudioPageHeadModel = {
    kicker: "Content library",
    access: studioAccessRequirement("trusted"),
    title: activeType?.label ?? entityType ?? "Library",
    metadata: [
      `${entityCount} ${entityCount === 1 ? "entity" : "entities"}`,
      ...(syncPending ? ["Sync pending"] : []),
    ],
    totals: [],
  };
  const publicationState =
    typeHasPublicationField(entitySchema.fields) && mode.kind === "edit"
      ? entityPublicationState(mode.entity)
      : null;
  const editorHead: StudioPageHeadModel = {
    kicker: entitySchema.isSingleton
      ? `${studioArea(entityType, null)} / singleton`
      : collectionLabel,
    access: studioAccessRequirement("trusted"),
    title: heading ?? "Editor",
    metadata:
      mode.kind === "create"
        ? [`${entryLabel} · new`]
        : publicationState
          ? [`${entryLabel} · ${publicationState}`]
          : [],
    totals: [],
  };
  const declarativeHead =
    activeWorkspace && declarativeWorkspaceData
      ? declarativeStudioPageHead(
          activeWorkspace,
          declarativeWorkspaceData.view,
        )
      : null;
  return (
    <div
      className={editorClass("studio", library.frame)}
      data-studio-shell=""
      data-view={
        activeWorkspaceId ? "workspace" : editing ? "editor" : "listing"
      }
    >
      <StudioChrome
        contextLabel={collectionLabel}
        onContextClick={
          editing && !entitySchema.isSingleton ? backToList : undefined
        }
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
            className={editorClass("", library.listing)}
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
                <Button
                  type="button"
                  disabled={!canCreate || !schema}
                  onClick={startCreate}
                >
                  New {entryLabel.toLowerCase()}
                </Button>
              }
            />
            {!entitySchema.isSingleton && entityTotal > 0 && (
              <nav
                className={editorClass(
                  "listing-pagination",
                  library.pagination,
                )}
                aria-label={`${activeType?.label ?? "Entity"} pagination`}
              >
                <span
                  className={editorClass("", library.range)}
                  aria-live="polite"
                >
                  {entityOffset + 1}–{pageEnd} of {entityTotal}
                </span>
                <span className={editorClass("", library.pager)}>
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={entityListLoading || entityOffset === 0}
                    onClick={() =>
                      changeEntityPage(Math.max(0, entityOffset - entityLimit))
                    }
                  >
                    Previous
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={
                      entityListLoading ||
                      entityOffset + entityLimit >= entityTotal
                    }
                    onClick={() => changeEntityPage(entityOffset + entityLimit)}
                  >
                    Next
                  </Button>
                </span>
              </nav>
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
                  )}
                  data-studio-record=""
                  onClick={() => openEntity(entity.id)}
                >
                  <span className={editorClass("", library.index)}>
                    {String(entityOffset + index + 1).padStart(2, "0")}
                  </span>
                  <span
                    className={editorClass("", library.title)}
                    title={entity.id}
                  >
                    {entityTitle(entity)}
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
                  <span className={editorClass("", library.updated)}>
                    {formatUpdated(entity.updated)}
                  </span>
                </button>
              ))}
            {!props.readError &&
              !entityListLoading &&
              entities?.length === 0 && (
                <StudioStatus className={editorClass("", library.empty)}>
                  Nothing here yet — start the first entry.
                </StudioStatus>
              )}
          </main>
        ) : (
          <form
            className={editorClass("", layout.editor)}
            data-studio-editor=""
            data-mobile-pane={mobilePane}
            onSubmit={(event) => {
              event.preventDefault();
              if (canEdit) save();
            }}
          >
            <StudioPageHead
              model={editorHead}
              appearance="document"
              action={
                <Button
                  type="submit"
                  className="studio-editor-head-save"
                  disabled={!canEdit || saveState.kind === "saving"}
                >
                  {saveState.kind === "saving" ? "Saving…" : "Save changes"}
                </Button>
              }
            />
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
                    className={editorClass("", editorStyles.paneTrigger)}
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
            <aside className={editorClass("", layout.colophon)}>
              <div className={editorClass("", editorStyles.propertiesHead)}>
                <h2 className={editorClass("", editorStyles.propertiesLabel)}>
                  Properties
                </h2>
                {mode.kind === "create" || publicationState ? (
                  <span
                    className={editorClass("", editorStyles.propertiesLabel)}
                  >
                    {mode.kind === "create" ? "New" : publicationState}
                  </span>
                ) : null}
              </div>
              <fieldset
                className={editorClass("", layout.fields)}
                disabled={!canEdit}
              >
                {entitySchema.fields
                  .filter((descriptor) => isFieldVisible(descriptor, draft))
                  .map((descriptor) => (
                    <div key={descriptor.name} data-studio-field-assist="">
                      <Field
                        descriptor={descriptor}
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
                  ))}
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
            </aside>
            <section className={editorClass("", layout.manuscript)}>
              {entitySchema.hasBody ? (
                <BodyEditor
                  value={body}
                  mode={bodyMode}
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
              ) : (
                <StudioStatus className={editorClass("", layout.empty)}>
                  This type has no body — its fields are the whole record.
                </StudioStatus>
              )}
            </section>
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
                  {editorSaveLabel(saveState, hasUnsavedChanges)}
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
