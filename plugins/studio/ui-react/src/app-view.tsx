/** @jsxImportSource react */
import type {
  RuntimeStudioWorkspaceData,
  RuntimeOperatorActionControl,
  RuntimeOperatorLaunchIntent,
} from "@brains/plugins";
import {
  ConfirmDialog,
  OperatorViewRenderer,
  operatorViewRendererStyles,
} from "@brains/operator-view-react";
import type { Dispatch, ReactElement, ReactNode, SetStateAction } from "react";
import { styles } from "./app-styles";
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
  PipelineStations,
  SaveStateNotice,
} from "./editor-status";
import { PublicationActions } from "./publication-actions";
import responsiveStyles from "./responsive.css" with { type: "text" };
import {
  entityPublicationState,
  entityTitle,
  formatUpdated,
  singularLabel,
} from "./ui-utils";
import visualRefreshStyles from "./visual-refresh.css" with { type: "text" };

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
  declarativeWorkspaceData: RuntimeStudioWorkspaceData | null;
  workspaceQuery: StudioWorkspaceQuery;
  entityType: string | null;
  entities: EntitySummary[] | null;
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
}): ReactElement {
  return (
    <div className="studio">
      <style>{`${styles}\n${visualRefreshStyles}\n${responsiveStyles}\n${operatorViewRendererStyles}`}</style>
      <p
        className={
          props.error ? "status status-error boot-status" : "status boot-status"
        }
      >
        {props.message}
      </p>
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
  return (
    <div className="studio" data-view="account">
      <style>{`${styles}\n${visualRefreshStyles}\n${responsiveStyles}\n${operatorViewRendererStyles}`}</style>
      <header className="crumbbar">
        <span className="crumb">Account</span>
        <span className="spacer" />
      </header>
      <div className="studio-body">
        <aside className="rail">
          <TypeSwitcher
            types={props.types}
            active={null}
            onSelect={props.selectEntityType}
            workspaces={props.workspaces}
            activeWorkspace={props.workspaceId}
            workspaceBadges={workspaceRailBadges(props.workspaces)}
            onSelectWorkspace={props.selectWorkspace}
          />
        </aside>
        <main className="account-studio-pane">{props.children}</main>
      </div>
    </div>
  );
}

export function StudioAppView(props: StudioAppViewProps): ReactElement {
  const {
    activeWorkspaceId,
    types,
    workspaces,
    workspaceError,
    declarativeWorkspaceData,
    workspaceQuery,
    entityType,
    entities,
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
      ? entityTitle(mode.entity)
      : mode.kind === "create"
        ? `New ${activeType?.label ?? entityType}`
        : (activeType?.label ?? entityType);
  const collectionLabel =
    activeWorkspace?.label ?? activeType?.label ?? entityType ?? "Studio";
  const entryLabel = singularLabel(collectionLabel);
  const syncPending = syncStatus?.git?.hasChanges === true;
  const publicationWorkspace = workspaces.find(
    (workspace) =>
      workspace.pluginId === "content-pipeline" &&
      workspace.entityTypes.includes(selectedEntityType),
  );
  return (
    <div
      className="studio"
      data-view={
        activeWorkspaceId ? "workspace" : editing ? "editor" : "listing"
      }
    >
      <style>{`${styles}\n${visualRefreshStyles}\n${responsiveStyles}\n${operatorViewRendererStyles}`}</style>
      <header className="crumbbar">
        <span className="crumb">
          {editing && !entitySchema.isSingleton ? (
            <button type="button" onClick={backToList}>
              {collectionLabel}
            </button>
          ) : (
            collectionLabel
          )}
          {editing && (
            <>
              {" / "}
              <strong>{heading}</strong>
            </>
          )}
        </span>
        <span className="spacer" />
      </header>
      <div className="studio-body">
        <aside className="rail">
          <TypeSwitcher
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
          workspaceError ? (
            <main className="declarative-workspace">
              <p className="status status-error">{workspaceError}</p>
            </main>
          ) : declarativeWorkspaceData ? (
            <OperatorViewRenderer
              data={declarativeWorkspaceData}
              onOpenEntity={openWorkspaceEntity}
              onLaunch={openWorkspaceLaunch}
              onAction={performDeclarativeAction}
              query={workspaceQuery}
              {...(activeWorkspaceId
                ? {
                    onQueryChange: (query: StudioWorkspaceQuery) =>
                      onWorkspaceQueryChange(activeWorkspaceId, query),
                  }
                : {})}
            />
          ) : null
        ) : !editing ? (
          <main className="listing">
            <div className="listing-head">
              <h3>{activeType?.label ?? entityType}</h3>
              <span className="meta">
                {entities?.length ?? 0}{" "}
                {entities?.length === 1 ? "entity" : "entities"} · sorted by
                updated
              </span>
              <button
                type="button"
                className="btn"
                disabled={!canCreate}
                onClick={startCreate}
              >
                New {entryLabel.toLowerCase()}
              </button>
            </div>
            {(entities ?? []).map((entity, index) => (
              <button
                type="button"
                key={entity.id}
                className="row"
                onClick={() => openEntity(entity.id)}
              >
                <span className="idx">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span className="title">
                  {entityTitle(entity)}
                  <small>
                    {singularLabel(entity.entityType)}/{entity.id}
                  </small>
                </span>
                {typeHasPublicationField(entitySchema.fields) && (
                  <span className={`chip ${entityPublicationState(entity)}`}>
                    {entityPublicationState(entity)}
                  </span>
                )}
                <span className="updated">{formatUpdated(entity.updated)}</span>
                <span className="sync">
                  <span
                    className={syncPending ? "sync-dot pending" : "sync-dot"}
                  />
                  {syncPending ? "exporting" : "committed"}
                </span>
              </button>
            ))}
            {entities?.length === 0 && (
              <p className="status listing-empty">
                Nothing here yet — start the first entry.
              </p>
            )}
          </main>
        ) : (
          <form
            className="editor"
            data-mobile-pane={mobilePane}
            onSubmit={(event) => {
              event.preventDefault();
              if (canEdit) save();
            }}
          >
            <nav className="studio-mobile-modes" aria-label="Editor view">
              {MOBILE_EDITOR_PANES.map((pane) => (
                <button
                  key={pane}
                  type="button"
                  className={
                    pane === mobilePane
                      ? "studio-mobile-mode is-active"
                      : "studio-mobile-mode"
                  }
                  disabled={pane !== "details" && !entitySchema.hasBody}
                  onClick={() => {
                    setMobilePane(pane);
                    if (pane === "write") setBodyMode("source");
                    if (pane === "preview") setBodyMode("preview");
                  }}
                >
                  {pane}
                </button>
              ))}
            </nav>
            <aside className="colophon">
              <div className="form-title">
                <h2>
                  <span className="studio-form-desktop-label">Frontmatter</span>
                  <span className="studio-form-mobile-label">Colophon</span>
                </h2>
                <span>
                  {entryLabel.toLowerCase()} ·{" "}
                  {mode.kind === "create"
                    ? "new"
                    : entityPublicationState(mode.entity)}
                </span>
              </div>
              <fieldset className="capability-fields" disabled={!canEdit}>
                {entitySchema.fields
                  .filter((descriptor) => isFieldVisible(descriptor, draft))
                  .map((descriptor) => (
                    <div key={descriptor.name} className="field-with-assist">
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
                  <p className="status">
                    This type is raw markdown — the whole document is the body.
                  </p>
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
            <section className="manuscript">
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
                <p className="status manuscript-empty">
                  This type has no body — its fields are the whole record.
                </p>
              )}
            </section>
            <footer className="pipeline">
              <button
                type="submit"
                className="save-btn"
                disabled={!canEdit || saveState.kind === "saving"}
              >
                {saveState.kind === "saving" ? "Saving…" : "Save"}
              </button>
              {syncStatus?.directorySync && (
                <PipelineStations
                  view={derivePipeline({
                    save: saveState,
                    git: syncStatus.git,
                    baselineCommit,
                  })}
                  gitConfigured={syncStatus.git !== null}
                />
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
                onReload={() => {
                  if (mode.kind === "edit") openEntity(mode.entity.id);
                }}
              />
              <span className="studio-mobile-save-status">
                <b>
                  {saveState.kind === "saving"
                    ? "Saving changes"
                    : saveState.kind === "saved"
                      ? "All changes saved"
                      : "Entity pipeline"}
                </b>
                {syncStatus?.git?.lastCommit
                  ? `db → file → ${syncStatus.git.lastCommit.slice(0, 7)}`
                  : "entity db"}
              </span>
              <span className="spacer" />
              {mode.kind === "edit" &&
                !entitySchema.isSingleton &&
                canDelete && (
                  <>
                    <button
                      type="button"
                      className="btn danger"
                      onClick={() =>
                        dispatchEditor({ type: "deleteRequested" })
                      }
                    >
                      Delete
                    </button>
                    <details className="studio-mobile-more">
                      <summary aria-label="More document actions">•••</summary>
                      <button
                        type="button"
                        onClick={(event) => {
                          // Fold the disclosure so it isn't left hanging open
                          // behind the confirmation dialog's scrim.
                          event.currentTarget
                            .closest("details")
                            ?.removeAttribute("open");
                          dispatchEditor({ type: "deleteRequested" });
                        }}
                      >
                        Delete entry
                      </button>
                    </details>
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
          confirmClassName="danger"
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
