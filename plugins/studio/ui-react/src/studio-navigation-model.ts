import type { EntityTypeInfo, StudioWorkspaceInfo } from "./api";
import type { GroupingNavigation } from "./grouping-url-query";
import {
  studioArea,
  studioTypeGroup,
  SYSTEM_TYPE_GROUPS,
  type StudioArea,
} from "./studio-areas";
import {
  MOBILE_GROUPING_PREFIX,
  workspaceBadge,
} from "./studio-navigation-parts";

export interface NavigationTypeGroup {
  label: string;
  types: EntityTypeInfo[];
}

export interface NavigationArea {
  id: StudioArea;
  index: string;
  label: string;
  available: boolean;
  accessibleLabel?: string;
  badge?: number;
}

/** Areas whose destinations open in a leaf beside the rail. */
export const LEAF_AREAS: readonly StudioArea[] = ["library", "work", "system"];

export interface NavigationModelInput {
  types: EntityTypeInfo[];
  workspaces?: StudioWorkspaceInfo[] | undefined;
  workspaceBadges?: Record<string, number> | undefined;
  groupings?: GroupingNavigation | undefined;
  active: string | null;
  activeWorkspace?: string | null | undefined;
}

/** Everything Studio's navigation shows, as both the rail and the phone sheet read it. */
export interface NavigationModel {
  overviewWorkspace: StudioWorkspaceInfo | undefined;
  chatWorkspace: StudioWorkspaceInfo | undefined;
  administrationWorkspace: StudioWorkspaceInfo | undefined;
  operationWorkspaces: StudioWorkspaceInfo[];
  /** Content and collections, browsed from Library. */
  primaryTypeGroups: NavigationTypeGroup[];
  /** Brain machinery and site types, browsed from System. */
  secondaryTypeGroups: NavigationTypeGroup[];
  currentArea: StudioArea | null;
  /** The open grouping, workspace or type, as one navigation key. */
  destination: string | null;
  areas: readonly NavigationArea[];
}

export function deriveNavigationModel(
  input: NavigationModelInput,
): NavigationModel {
  const overviewWorkspace = input.workspaces?.find(
    (workspace) => workspace.id === "studio:overview",
  );
  const chatWorkspace = input.workspaces?.find(
    (workspace) => studioArea(null, workspace.id) === "chat",
  );
  const administrationWorkspace = input.workspaces?.find(
    (workspace) => studioArea(null, workspace.id) === "administration",
  );
  const operationWorkspaces =
    input.workspaces?.filter(
      (workspace) => studioArea(null, workspace.id) === "work",
    ) ?? [];
  const groups = (["Content", "Collections", "Site", "System"] as const)
    .map((label) => ({
      label,
      types: input.types.filter((info) => studioTypeGroup(info) === label),
    }))
    .filter((group) => group.types.length > 0);
  const primaryTypeGroups = groups.filter(
    (group) => group.label === "Content" || group.label === "Collections",
  );
  const systemTypes = (ids: string[]): EntityTypeInfo[] =>
    ids.flatMap((id) =>
      input.types.filter(
        (info) => info.entityType === id && info.classification === "system",
      ),
    );
  const secondaryTypeGroups = [
    ...SYSTEM_TYPE_GROUPS.map((group) => ({
      label: group.label,
      types: systemTypes([...group.types]),
    })),
    ...groups.filter((group) => group.label === "Site"),
    {
      label: "Other",
      types: input.types.filter(
        (info) =>
          studioTypeGroup(info) === "System" &&
          !SYSTEM_TYPE_GROUPS.some((group) =>
            group.types.some((type) => type === info.entityType),
          ),
      ),
    },
  ].filter((group) => group.types.length > 0);
  const currentArea = input.groupings?.active
    ? "library"
    : studioArea(
        input.types.find((type) => type.entityType === input.active) ?? null,
        input.activeWorkspace ?? null,
      );
  const destination = input.groupings?.active
    ? `${MOBILE_GROUPING_PREFIX}${input.groupings.active}`
    : (input.activeWorkspace ?? input.active);
  const badges = input.workspaceBadges;
  const areas: readonly NavigationArea[] = [
    {
      id: "overview",
      index: "00",
      label: "Overview",
      available: overviewWorkspace !== undefined,
      badge: workspaceBadge(overviewWorkspace, badges),
    },
    {
      id: "chat",
      index: "01",
      label: "Chat",
      available: chatWorkspace !== undefined,
      badge: workspaceBadge(chatWorkspace, badges),
    },
    {
      id: "library",
      index: "02",
      label: "Library",
      available:
        primaryTypeGroups.length > 0 ||
        (input.groupings?.items.length ?? 0) > 0,
    },
    {
      id: "work",
      index: "03",
      label: "Work",
      available: operationWorkspaces.length > 0,
    },
    {
      id: "administration",
      index: "04",
      label: "Admin",
      accessibleLabel: "Administration",
      available: administrationWorkspace !== undefined,
      badge: workspaceBadge(administrationWorkspace, badges),
    },
    {
      id: "system",
      index: "05",
      label: "System",
      available: secondaryTypeGroups.length > 0,
    },
  ];
  return {
    overviewWorkspace,
    chatWorkspace,
    administrationWorkspace,
    operationWorkspaces,
    primaryTypeGroups,
    secondaryTypeGroups,
    currentArea,
    destination,
    areas,
  };
}
