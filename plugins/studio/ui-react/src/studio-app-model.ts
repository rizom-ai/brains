import { ApiError } from "./api";
import type {
  EntityTypeInfo,
  StudioWorkspaceInfo,
  TypeSchema,
  ValidationIssue,
} from "./api";
import {
  studioArea,
  studioEditorPresentation,
  typeHasPublicationField,
  type StudioEditorPresentation,
} from "./entity-fields";
import {
  systemEditorCopy,
  type SystemEditorCopy,
} from "./studio-system-presentation";
import {
  declarativeStudioPageHead,
  studioAccessRequirement,
  type StudioPageHeadModel,
} from "./studio-page-head";
import { folderLabel } from "./studio-hierarchy";
import { entityPublicationState, entityTitle, singularLabel } from "./ui-utils";
import type { StudioAppViewProps } from "./app-view-props";

const EMPTY_TYPE_SCHEMA: TypeSchema = {
  entityType: "",
  format: "frontmatter",
  isSingleton: false,
  hasBody: false,
  fields: [],
};

export function workspaceRailBadges(
  workspaces: StudioWorkspaceInfo[],
): Record<string, number> {
  return Object.fromEntries(
    workspaces.flatMap((workspace) =>
      workspace.badge === undefined ? [] : [[workspace.id, workspace.badge]],
    ),
  );
}

/** Everything StudioAppView derives from its props before rendering. */
export interface StudioAppModel {
  activeType: EntityTypeInfo | undefined;
  activeWorkspace: StudioWorkspaceInfo | undefined;
  entitySchema: TypeSchema;
  presentation: StudioEditorPresentation;
  selectedEntityType: string;
  groupingFields: string[];
  systemDesign: SystemEditorCopy | undefined;
  editing: boolean;
  canCreate: boolean;
  canEdit: boolean;
  namedCreate: boolean;
  fieldIssues: ValidationIssue[] | undefined;
  destinationBlocked: boolean;
  hierarchyKind: "page" | "folder";
  folderContext: string;
  canDelete: boolean;
  canPublish: boolean;
  canAssist: boolean;
  heading: string | null;
  collectionLabel: string;
  entryLabel: string;
  syncPending: boolean;
  publicationWorkspace: StudioWorkspaceInfo | undefined;
  entityCount: number;
  pageEnd: number;
  workspaceBadges: Record<string, number>;
  collectionFiltered: boolean;
  directFolderCount: boolean;
  listingHead: StudioPageHeadModel;
  publicationState: "draft" | "published" | null;
  editorHead: StudioPageHeadModel;
  declarativeHead: StudioPageHeadModel | null;
}

export function deriveStudioAppModel(
  props: StudioAppViewProps,
): StudioAppModel {
  const {
    activeWorkspaceId,
    types,
    workspaces,
    declarativeWorkspaceData,
    entityType,
    entities,
    entityOffset,
    entityLimit,
    entityTotal,
    schema,
    editor,
    syncStatus,
  } = props;
  const { mode, save: saveState } = editor;
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
  const groupingFields = (props.groupings?.items ?? [])
    .filter((grouping) => grouping.types.includes(selectedEntityType))
    .map((grouping) => grouping.field);
  const systemDesign = systemEditorCopy(selectedEntityType);
  const editing =
    !props.groupingView && !activeWorkspaceId && mode.kind !== "browse";
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
  return {
    activeType,
    activeWorkspace,
    entitySchema,
    presentation,
    selectedEntityType,
    groupingFields,
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
    heading,
    collectionLabel,
    entryLabel,
    syncPending,
    publicationWorkspace,
    entityCount,
    pageEnd,
    workspaceBadges,
    collectionFiltered,
    directFolderCount,
    listingHead,
    publicationState,
    editorHead,
    declarativeHead,
  };
}
