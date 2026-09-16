/** @jsxImportSource react */
import type {
  RuntimeStudioWorkspaceData,
  RuntimeOperatorActionControl,
  RuntimeOperatorLaunchIntent,
  EntityIdPath,
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
import { ApiError } from "./api";
import type {
  AgentTarget,
  StudioWorkspaceInfo,
  EntitySummary,
  EntityFolder,
  DestinationPreview,
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
  studioEditorPresentation,
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

import type { StudioCollectionQuery } from "../../src/collection-query";
import { StudioCollectionControls } from "./studio-collection-controls";
import {
  StudioFolderTrail,
  StudioFolderRows,
  StudioDestination,
  StudioCreationLayout,
  folderLabel,
} from "./studio-hierarchy";
import { hierarchyStyles as hierarchy } from "./studio-hierarchy.styles";

export type MobileEditorPane = "details" | "write" | "preview";

/** Pane preferences are presentation-only and stay in the mounted app. */
export function mobileEditorEntry(
  schema: Pick<TypeSchema, "format" | "hasBody">,
  preferred: MobileEditorPane | null,
): MobileEditorPane {
  if (!schema.hasBody) return "details";
  return preferred ?? (schema.format === "raw" ? "preview" : "details");
}

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
  folders: EntityFolder[];
  collectionPath: string;
  selectFolder: (prefix: EntityIdPath | null) => void;
  creationDestination: {
    data: DestinationPreview | null;
    pending: boolean;
    error: Error | null;
  };
  entityOffset: number;
  entityLimit: number;
  entityTotal: number;
  collectionQuery: StudioCollectionQuery;
  onCollectionQueryChange: (query: StudioCollectionQuery) => void;
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
  setMobilePane: (pane: MobileEditorPane) => void;
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
  const activeType = types.find((info) => info.entityType === entityType);
  const activeWorkspace = workspaces.find(
    (workspace) => workspace.id === activeWorkspaceId,
  );

  // Workspace branches do not read these entity fallbacks.
  const entitySchema = schema ?? EMPTY_TYPE_SCHEMA;
  const presentation = studioEditorPresentation(
    entitySchema.entityType,
    entitySchema.hasBody,
  );
  const selectedEntityType = entityType ?? "";
  const editing = !activeWorkspaceId && mode.kind !== "browse";
  const canCreate =
    activeType?.capabilities.canCreate === true &&
    (entityType !== "note" ||
      (mode.kind === "create"
        ? !mode.prefix
        : props.collectionQuery.prefix === null));
  const canEdit =
    mode.kind === "create"
      ? canCreate
      : mode.kind === "edit" && activeType?.capabilities.canUpdate === true;
  const namedCreate = mode.kind === "create" && mode.segment !== undefined;
  const fieldIssues =
    saveState.kind === "error"
      ? saveState.issues
      : namedCreate && props.creationDestination.error instanceof ApiError
        ? props.creationDestination.error.issues
        : undefined;
  const destinationBlocked =
    namedCreate &&
    (!props.creationDestination.data ||
      props.creationDestination.pending ||
      Boolean(props.creationDestination.error));
  const hierarchyKind = entityType === "site-content" ? "page" : "folder";
  const folderContext =
    props.collectionQuery.prefix?.map(folderLabel).join(" / ") ??
    activeType?.label ??
    entityType ??
    "Collection";
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
  // The server counts what the query matched, so the head says so rather than
  // reporting a filtered count as if the collection had shrunk.
  const collectionFiltered =
    Boolean(props.collectionQuery.q) ||
    props.collectionQuery.visibility !== "all" ||
    Boolean(props.collectionQuery.status);
  const directFolderCount =
    props.collectionQuery.scope === "folder" &&
    !props.collectionQuery.q &&
    (props.collectionQuery.prefix !== null || props.folders.length > 0);
  const listingHead: StudioPageHeadModel = {
    kicker: "Content library",
    access: studioAccessRequirement("trusted"),
    title: activeType?.label ?? entityType ?? "Library",
    metadata: [
      directFolderCount
        ? `${entityCount} ${collectionFiltered ? "matching " : ""}${entityCount === 1 ? "entry" : "entries"} here`
        : collectionFiltered
          ? `${entityCount} matching ${entityCount === 1 ? "entity" : "entities"}`
          : `${entityCount} ${entityCount === 1 ? "entity" : "entities"}`,
      ...(props.folders.length > 0
        ? [
            `${props.folders.length} ${hierarchyKind}${props.folders.length === 1 ? "" : "s"} · ${entityCount + props.folders.reduce((sum, folder) => sum + folder.descendantCount, 0)} in total`,
          ]
        : []),
      ...(props.collectionQuery.prefix && !directFolderCount
        ? [
            props.collectionQuery.scope === "collection"
              ? "Whole collection"
              : `In this ${hierarchyKind}`,
          ]
        : []),
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
                <Button
                  type="button"
                  disabled={!canCreate || !schema}
                  data-studio-library-new=""
                  xstyle={hierarchy.desktopCreateAction}
                  onClick={startCreate}
                >
                  New {entryLabel.toLowerCase()}
                </Button>
              }
            />
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
              {namedCreate && (
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
                <StudioEditorProperties
                  key={`${selectedEntityType}:${mode.kind === "edit" ? mode.entity.id : "create"}`}
                  presentation={presentation}
                  reveal={(fieldIssues?.length ?? 0) > 0}
                >
                  {presentation !== "document" && (
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
                    {entitySchema.fields
                      .filter((descriptor) => isFieldVisible(descriptor, draft))
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
                      ))}
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
