import type { Dispatch, ReactElement, SetStateAction } from "react";
import { styles } from "./app-styles";
import type {
  AgentTarget,
  CmsWorkspaceInfo,
  DirectorySyncWorkspaceActionResult,
  DirectorySyncWorkspaceSnapshot,
  EntitySummary,
  EntityTypeInfo,
  PublicationPipelineSnapshot,
  PublishingAction,
  PublishingActionResult,
  SiteWorkspaceAction,
  SiteWorkspaceActionResult,
  SiteWorkspaceSnapshot,
  SyncStatus,
  TypeSchema,
} from "./api";
import { BodyEditor, type BodyMode } from "./body-editor";
import { DirectorySyncWorkspace } from "./directory-sync-workspace";
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
import {
  PublicationActions,
  PublishingWorkspace,
} from "./publishing-workspace";
import responsiveStyles from "./responsive.css" with { type: "text" };
import { SiteWorkspace } from "./site-workspace";
import {
  entityPublicationState,
  entityTitle,
  formatUpdated,
  singularLabel,
} from "./ui-utils";
import visualRefreshStyles from "./visual-refresh.css" with { type: "text" };

export type MobileEditorPane = "details" | "write" | "preview";

export interface CmsAppViewProps {
  activeWorkspaceId: string | null;
  types: EntityTypeInfo[];
  workspaces: CmsWorkspaceInfo[];
  workspaceError: string | null;
  publicationWorkspaceData: PublicationPipelineSnapshot | null;
  siteWorkspaceData: SiteWorkspaceSnapshot | null;
  directorySyncWorkspaceData: DirectorySyncWorkspaceSnapshot | null;
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
  performPublishingAction: (
    action: PublishingAction,
  ) => Promise<PublishingActionResult>;
  performSiteAction: (
    action: SiteWorkspaceAction,
  ) => Promise<SiteWorkspaceActionResult>;
  performDirectorySyncAction: () => Promise<DirectorySyncWorkspaceActionResult>;
  startCreate: () => void;
  openEntity: (entityId: string) => void;
  runFieldAssist: (variant: FieldAssistVariant, field: string) => void;
  applyFieldAssist: (field: string, suggestion: string | string[]) => void;
  save: () => void;
  remove: () => void;
  onNavigationReset: () => void;
  onNavigationProceed: () => void;
}

export function CmsAppStatus(props: {
  message: string;
  error?: boolean;
}): ReactElement {
  return (
    <div className="studio">
      <style>{`${styles}\n${visualRefreshStyles}\n${responsiveStyles}`}</style>
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

export function CmsAppView(props: CmsAppViewProps): ReactElement {
  const {
    activeWorkspaceId,
    types,
    workspaces,
    workspaceError,
    publicationWorkspaceData,
    siteWorkspaceData,
    directorySyncWorkspaceData,
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
    performPublishingAction,
    performSiteAction,
    performDirectorySyncAction,
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

  // The guards above guarantee these values on every entity-rendering branch.
  // Workspace branches do not read them.
  const entitySchema = schema as TypeSchema;
  const selectedEntityType = entityType as string;
  const editing = !activeWorkspaceId && mode.kind !== "browse";
  const heading =
    mode.kind === "edit"
      ? entityTitle(mode.entity)
      : mode.kind === "create"
        ? `New ${activeType?.label ?? entityType}`
        : (activeType?.label ?? entityType);
  const collectionLabel =
    activeWorkspace?.label ?? activeType?.label ?? entityType ?? "CMS";
  const entryLabel = singularLabel(collectionLabel);
  const syncPending = syncStatus?.git?.hasChanges === true;
  const publicationWorkspace = workspaces.find(
    (workspace) =>
      workspace.rendererName === "PublishingWorkspace" &&
      workspace.entityTypes.includes(selectedEntityType),
  );
  return (
    <div
      className="studio"
      data-view={
        activeWorkspaceId ? "workspace" : editing ? "editor" : "listing"
      }
    >
      <style>{`${styles}\n${visualRefreshStyles}\n${responsiveStyles}`}</style>
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
            workspaceBadges={{
              ...(publicationWorkspaceData
                ? {
                    publishing: publicationWorkspaceData.summary.needsOperator,
                  }
                : {}),
              ...(siteWorkspaceData
                ? {
                    site: siteWorkspaceData.environments.filter(
                      (entry) => entry.lastFailure !== undefined,
                    ).length,
                  }
                : {}),
              ...(directorySyncWorkspaceData
                ? { sync: directorySyncWorkspaceData.issues.length }
                : {}),
            }}
            onSelectWorkspace={selectWorkspace}
          />
        </aside>
        {activeWorkspaceId ? (
          workspaceError ? (
            <main className="publishing-workspace">
              <p className="status status-error">{workspaceError}</p>
            </main>
          ) : publicationWorkspaceData ? (
            <PublishingWorkspace
              data={publicationWorkspaceData}
              onOpenEntity={openWorkspaceEntity}
              onAction={performPublishingAction}
            />
          ) : siteWorkspaceData ? (
            <SiteWorkspace
              data={siteWorkspaceData}
              onAction={performSiteAction}
              {...(types.some((info) => info.entityType === "site-info")
                ? { onOpenSiteInfo: () => selectEntityType("site-info") }
                : {})}
            />
          ) : directorySyncWorkspaceData ? (
            <DirectorySyncWorkspace
              data={directorySyncWorkspaceData}
              onAction={performDirectorySyncAction}
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
              <button type="button" className="btn" onClick={startCreate}>
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
              save();
            }}
          >
            <nav className="cms-mobile-modes" aria-label="Editor view">
              {(["details", "write", "preview"] as const).map((pane) => (
                <button
                  key={pane}
                  type="button"
                  className={
                    pane === mobilePane
                      ? "cms-mobile-mode is-active"
                      : "cms-mobile-mode"
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
                  <span className="cms-form-desktop-label">Frontmatter</span>
                  <span className="cms-form-mobile-label">Colophon</span>
                </h2>
                <span>
                  {entryLabel.toLowerCase()} ·{" "}
                  {mode.kind === "create"
                    ? "new"
                    : entityPublicationState(mode.entity)}
                </span>
              </div>
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
                    {entitySchema.hasBody && body.trim().length > 0 && (
                      <FieldAssistControls
                        descriptor={descriptor}
                        state={fieldAssistState}
                        onRun={runFieldAssist}
                        onApply={applyFieldAssist}
                        onDiscard={() => setFieldAssistState({ kind: "idle" })}
                      />
                    )}
                  </div>
                ))}
              {entitySchema.fields.length === 0 && (
                <p className="status">
                  This type is raw markdown — the whole document is the body.
                </p>
              )}
              {publicationWorkspace && mode.kind === "edit" && (
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
                  assist={{
                    entityType: selectedEntityType,
                    frontmatter: draft,
                    agents: agentTargets,
                  }}
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
                disabled={saveState.kind === "saving"}
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
              <span className="cms-mobile-save-status">
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
              {mode.kind === "edit" && !entitySchema.isSingleton && (
                <>
                  <button
                    type="button"
                    className="btn danger"
                    onClick={() => dispatchEditor({ type: "deleteRequested" })}
                  >
                    Delete
                  </button>
                  <details className="cms-mobile-more">
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
      {deleteOpen && mode.kind === "edit" && (
        <DeleteDialog
          entityId={mode.entity.id}
          deleting={deleting}
          onCancel={() => dispatchEditor({ type: "deleteCancelled" })}
          onConfirm={remove}
        />
      )}
      {navigationBlocked && (
        <div className="modal-scrim" role="presentation">
          <section
            className="delete-modal"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="discard-navigation-title"
          >
            <span className="modal-mark" aria-hidden="true">
              ↩
            </span>
            <h3 id="discard-navigation-title">Discard unsaved changes?</h3>
            <p>
              This draft has not been saved. Continue only if you want to leave
              it behind.
            </p>
            <div className="modal-actions">
              <button
                type="button"
                className="btn ghost"
                onClick={onNavigationReset}
              >
                Keep editing
              </button>
              <button
                type="button"
                className="btn danger"
                onClick={onNavigationProceed}
              >
                Discard and continue
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
