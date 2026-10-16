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
import type { GroupingValueRules } from "../../src/grouping-definitions-contract";

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

/** The workspace the server declares as the publisher of a type, if any. */
export function publicationWorkspaceFor(
  workspaces: StudioWorkspaceInfo[],
  entityType: string,
): StudioWorkspaceInfo | undefined {
  return workspaces.find(
    (workspace) =>
      workspace.publishesEntityTypes === true &&
      workspace.entityTypes.includes(entityType),
  );
}

/** What the open editor lets the current user do with the active type. */
export interface EditorCapabilities {
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canPublish: boolean;
  canAssist: boolean;
  namedCreate: boolean;
  fieldIssues: ValidationIssue[] | undefined;
  destinationBlocked: boolean;
}

export function deriveEditorCapabilities(
  props: Pick<
    StudioAppViewProps,
    "editor" | "collectionQuery" | "creationDestination"
  >,
  activeType: EntityTypeInfo | undefined,
): EditorCapabilities {
  const { mode, save: saveState } = props.editor;
  const capabilities = activeType?.capabilities;
  // A flat type only holds entries at its root.
  const atCreatableLevel =
    activeType?.hierarchy.nested === true ||
    (mode.kind === "create"
      ? !mode.prefix
      : props.collectionQuery.prefix === null);
  const canCreate = capabilities?.canCreate === true && atCreatableLevel;
  const canEdit =
    mode.kind === "create"
      ? canCreate
      : mode.kind === "edit" && capabilities?.canUpdate === true;
  const namedCreate = mode.kind === "create" && mode.segment !== undefined;
  const destination = props.creationDestination;
  const destinationIssues =
    namedCreate && destination.error instanceof ApiError
      ? destination.error.issues
      : undefined;
  return {
    canCreate,
    canEdit,
    canDelete: capabilities?.canDelete === true,
    canPublish: capabilities?.canPublish === true,
    canAssist: canEdit && capabilities?.canAssist === true,
    namedCreate,
    fieldIssues:
      saveState.kind === "error" ? saveState.issues : destinationIssues,
    destinationBlocked:
      namedCreate &&
      (!destination.data || destination.pending || Boolean(destination.error)),
  };
}

/** "1 entry", "2 entries". */
function countOf(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

/** The collection listing's head and the facts it was phrased from. */
export interface ListingHead {
  collectionFiltered: boolean;
  directFolderCount: boolean;
  listingHead: StudioPageHeadModel;
}

export function deriveListingHead(
  props: Pick<
    StudioAppViewProps,
    "entityType" | "entityTotal" | "folders" | "collectionQuery"
  >,
  context: {
    activeType: EntityTypeInfo | undefined;
    hierarchyKind: "page" | "folder";
    syncPending: boolean;
  },
): ListingHead {
  const { entityTotal, folders, collectionQuery: query } = props;
  const { hierarchyKind } = context;
  // The server counts what the query matched, so the head says so rather than
  // reporting a filtered count as if the collection had shrunk.
  const collectionFiltered =
    Boolean(query.q) || query.visibility !== "all" || Boolean(query.status);
  const directFolderCount =
    query.scope === "folder" &&
    !query.q &&
    (query.prefix !== null || folders.length > 0);
  const matching = collectionFiltered ? "matching " : "";
  const entryCount = directFolderCount
    ? `${countOf(entityTotal, `${matching}entry`, `${matching}entries`)} here`
    : countOf(entityTotal, `${matching}entity`, `${matching}entities`);
  const descendantTotal = folders.reduce(
    (sum, folder) => sum + folder.descendantCount,
    entityTotal,
  );
  const levelCount =
    folders.length > 0
      ? [
          `${countOf(folders.length, hierarchyKind, `${hierarchyKind}s`)} · ${descendantTotal} in total`,
        ]
      : [];
  const scope =
    query.prefix && !directFolderCount
      ? [
          query.scope === "collection"
            ? "Whole collection"
            : `In this ${hierarchyKind}`,
        ]
      : [];
  return {
    collectionFiltered,
    directFolderCount,
    listingHead: {
      kicker: "Content library",
      access: studioAccessRequirement("trusted"),
      title: context.activeType?.label ?? props.entityType ?? "Library",
      metadata: [
        entryCount,
        ...levelCount,
        ...scope,
        ...(context.syncPending ? ["Sync pending"] : []),
      ],
      totals: [],
    },
  };
}

/** The editor's head and the labels it names the open entry with. */
export interface EditorHead {
  heading: string | null;
  collectionLabel: string;
  entryLabel: string;
  publicationState: "draft" | "published" | null;
  editorHead: StudioPageHeadModel;
}

export function deriveEditorHead(
  props: Pick<StudioAppViewProps, "entityType" | "editor">,
  context: {
    activeType: EntityTypeInfo | undefined;
    activeWorkspace: StudioWorkspaceInfo | undefined;
    entitySchema: TypeSchema;
    systemDesign: SystemEditorCopy | undefined;
  },
): EditorHead {
  const { entityType } = props;
  const { mode } = props.editor;
  const { activeType, entitySchema, systemDesign } = context;
  const typeLabel = activeType?.label ?? entityType;
  const singletonLabel = activeType?.isSingleton
    ? singularLabel(activeType.label)
    : undefined;
  const heading =
    mode.kind === "edit"
      ? (singletonLabel ?? entityTitle(mode.entity))
      : mode.kind === "create"
        ? `New ${typeLabel}`
        : typeLabel;
  const collectionLabel =
    context.activeWorkspace?.label ??
    systemDesign?.title ??
    singletonLabel ??
    typeLabel ??
    "Studio";
  const entryLabel = singularLabel(collectionLabel);
  const publicationState =
    mode.kind === "edit" && typeHasPublicationField(entitySchema.fields)
      ? entityPublicationState(mode.entity)
      : null;
  const entryState =
    mode.kind === "create" ? "new" : (publicationState ?? undefined);
  return {
    heading,
    collectionLabel,
    entryLabel,
    publicationState,
    editorHead: {
      kicker: entitySchema.isSingleton
        ? `${studioArea(activeType ?? null, null)} / singleton`
        : collectionLabel,
      access: studioAccessRequirement("trusted"),
      title: systemDesign?.title ?? heading ?? "Editor",
      metadata: entryState ? [`${entryLabel} · ${entryState}`] : [],
      totals: [],
    },
  };
}

/** Everything StudioAppView derives from its props before rendering. */
export interface StudioAppModel
  extends EditorCapabilities, ListingHead, EditorHead {
  activeType: EntityTypeInfo | undefined;
  activeWorkspace: StudioWorkspaceInfo | undefined;
  entitySchema: TypeSchema;
  presentation: StudioEditorPresentation;
  selectedEntityType: string;
  groupingFields: string[];
  groupingVocabularies: Record<string, GroupingValueRules>;
  systemDesign: SystemEditorCopy | undefined;
  editing: boolean;
  hierarchyKind: "page" | "folder";
  folderContext: string;
  syncPending: boolean;
  publicationWorkspace: StudioWorkspaceInfo | undefined;
  pageEnd: number;
  workspaceBadges: Record<string, number>;
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
  } = props;
  const activeType = types.find((info) => info.entityType === entityType);
  const activeWorkspace = workspaces.find(
    (workspace) => workspace.id === activeWorkspaceId,
  );

  // Workspace branches do not read these entity fallbacks.
  const entitySchema = schema ?? EMPTY_TYPE_SCHEMA;
  const selectedEntityType = entityType ?? "";
  const editorGroupings = (props.groupings?.items ?? []).filter((grouping) =>
    grouping.types.includes(selectedEntityType),
  );
  const systemDesign = systemEditorCopy(selectedEntityType);
  const hierarchyKind = activeType?.hierarchy.kind ?? "folder";
  const syncPending = props.syncStatus?.git?.hasChanges === true;
  const folderContext =
    props.collectionQuery.prefix
      ?.map(
        (segment, index) =>
          props.collectionTrail?.[index] ?? folderLabel(segment),
      )
      .join(" / ") ??
    activeType?.label ??
    entityType ??
    "Collection";
  return {
    activeType,
    activeWorkspace,
    entitySchema,
    presentation: studioEditorPresentation(
      entitySchema.entityType,
      entitySchema.hasBody,
    ),
    selectedEntityType,
    groupingFields: editorGroupings.map((grouping) => grouping.field),
    groupingVocabularies: Object.fromEntries(
      editorGroupings.map((grouping) => [
        grouping.field,
        grouping.rules ?? { multiple: true },
      ]),
    ),
    systemDesign,
    editing:
      !props.groupingView &&
      !activeWorkspaceId &&
      props.editor.mode.kind !== "browse",
    ...deriveEditorCapabilities(props, activeType),
    hierarchyKind,
    folderContext,
    ...deriveEditorHead(props, {
      activeType,
      activeWorkspace,
      entitySchema,
      systemDesign,
    }),
    syncPending,
    publicationWorkspace: publicationWorkspaceFor(
      workspaces,
      selectedEntityType,
    ),
    pageEnd: Math.min(
      entityOffset + (entities?.length ?? entityLimit),
      entityTotal,
    ),
    workspaceBadges: workspaceRailBadges(workspaces),
    ...deriveListingHead(props, { activeType, hierarchyKind, syncPending }),
    declarativeHead:
      activeWorkspace && declarativeWorkspaceData
        ? declarativeStudioPageHead(
            activeWorkspace,
            declarativeWorkspaceData.view,
          )
        : null,
  };
}
