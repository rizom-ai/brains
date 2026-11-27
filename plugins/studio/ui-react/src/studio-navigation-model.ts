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
import { STUDIO_CHAT_WORKSPACE_ID } from "../../src/chat-workspace";

export interface NavigationTypeGroup {
  label: string;
  types: EntityTypeInfo[];
}

/** One of Studio's five fixed sections, as navigation lists it. */
export interface NavigationSection {
  id: StudioArea;
  label: string;
  available: boolean;
  /** What the section's pages ask attention for, together. */
  badge?: number;
}

/** Sections browsed in place: their heading opens the list, not a page. */
export const LEAF_AREAS: readonly StudioArea[] = [
  "library",
  "publish",
  "brain",
];

export interface NavigationModelInput {
  types: EntityTypeInfo[];
  workspaces?: StudioWorkspaceInfo[] | undefined;
  workspaceBadges?: Record<string, number> | undefined;
  groupings?: GroupingNavigation | undefined;
  active: string | null;
  activeWorkspace?: string | null | undefined;
  /** Types this person opened, most recent first, as this browser recalls. */
  recentTypes?: readonly string[] | undefined;
}

/** Everything Studio's navigation shows, as both the sidebar and the phone sheet read it. */
export interface NavigationModel {
  /** The types navigation lists: a contained type lives inside its container. */
  types: EntityTypeInfo[];
  /** The listed type the open route belongs to. */
  active: string | null;
  /** Home's page, and Chat's: each section in its own right. */
  overviewWorkspace: StudioWorkspaceInfo | undefined;
  chatWorkspace: StudioWorkspaceInfo | undefined;
  /** Pages listed under Home, such as Inbox and Board. */
  homeWorkspaces: StudioWorkspaceInfo[];
  /** Pages listed under Chat, such as Guest chat. */
  chatWorkspaces: StudioWorkspaceInfo[];
  /** Content and collections, and pages plugins place in Library. */
  libraryTypeGroups: NavigationTypeGroup[];
  /** Library types with no entries yet, listed under All types. */
  emptyLibraryTypes: EntityTypeInfo[];
  libraryWorkspaces: StudioWorkspaceInfo[];
  publishWorkspaces: StudioWorkspaceInfo[];
  /** The brain's own machinery, and pages plugins place in Brain. */
  brainTypeGroups: NavigationTypeGroup[];
  brainWorkspaces: StudioWorkspaceInfo[];
  currentArea: StudioArea | null;
  /** The open grouping, workspace or type, as one navigation key. */
  destination: string | null;
  sections: readonly NavigationSection[];
}

/** The sum of a set of workspaces' badges; none when nothing asks. */
function sectionBadge(
  workspaces: (StudioWorkspaceInfo | undefined)[],
  badges: Record<string, number> | undefined,
): number | undefined {
  const total = workspaces.reduce(
    (sum, workspace) => sum + workspaceBadge(workspace, badges),
    0,
  );
  return total > 0 ? total : undefined;
}

/**
 * Whether a section lists destinations under its heading: always for the
 * sections browsed in place, and for Home and Chat when they hold pages
 * besides their own.
 */
export function sectionHasList(
  model: Pick<NavigationModel, "homeWorkspaces" | "chatWorkspaces">,
  area: StudioArea,
): boolean {
  if (area === "home") return model.homeWorkspaces.length > 0;
  if (area === "chat") return model.chatWorkspaces.length > 0;
  return LEAF_AREAS.includes(area);
}

export function deriveNavigationModel(
  input: NavigationModelInput,
): NavigationModel {
  const types = input.types.filter((info) => info.containedIn === undefined);
  const active =
    input.types.find((info) => info.entityType === input.active)?.containedIn ??
    input.active;
  const workspaces = input.workspaces ?? [];
  const inSection = (section: StudioArea): StudioWorkspaceInfo[] =>
    workspaces.filter((workspace) => studioArea(null, workspace) === section);
  const overviewWorkspace = workspaces.find(
    (workspace) => workspace.id === "studio:overview",
  );
  const chatWorkspace = workspaces.find(
    (workspace) => workspace.id === STUDIO_CHAT_WORKSPACE_ID,
  );
  const chatWorkspaces = inSection("chat").filter(
    (workspace) => workspace !== chatWorkspace,
  );
  const homeWorkspaces = inSection("home").filter(
    (workspace) => workspace !== overviewWorkspace,
  );
  const libraryWorkspaces = inSection("library");
  const publishWorkspaces = inSection("publish");
  const brainWorkspaces = inSection("brain");
  const groups = (["Content", "Collections", "Site", "System"] as const)
    .map((label) => ({
      label,
      types: types.filter((info) => studioTypeGroup(info) === label),
    }))
    .filter((group) => group.types.length > 0);
  // Library lists the types in use, most recently opened first; a type with
  // no entries waits under All types unless it is the one open.
  const recent = input.recentTypes ?? [];
  const recency = (info: EntityTypeInfo): number => {
    const at = recent.indexOf(info.entityType);
    return at < 0 ? recent.length : at;
  };
  const inUse = (info: EntityTypeInfo): boolean =>
    info.count > 0 || info.isSingleton || info.entityType === active;
  const libraryGroups = groups.filter(
    (group) => group.label === "Content" || group.label === "Collections",
  );
  const libraryTypeGroups = libraryGroups
    .map((group) => ({
      label: group.label,
      types: group.types
        .filter(inUse)
        .map((info, index) => ({ info, index }))
        .sort((a, b) => recency(a.info) - recency(b.info) || a.index - b.index)
        .map(({ info }) => info),
    }))
    .filter((group) => group.types.length > 0);
  const emptyLibraryTypes = libraryGroups.flatMap((group) =>
    group.types.filter((info) => !inUse(info)),
  );
  const systemTypes = (ids: string[]): EntityTypeInfo[] =>
    ids.flatMap((id) =>
      types.filter(
        (info) => info.entityType === id && info.classification === "system",
      ),
    );
  const brainTypeGroups = [
    ...SYSTEM_TYPE_GROUPS.map((group) => ({
      label: group.label,
      types: systemTypes([...group.types]),
    })),
    ...groups.filter((group) => group.label === "Site"),
    {
      label: "Other",
      types: types.filter(
        (info) =>
          studioTypeGroup(info) === "System" &&
          !SYSTEM_TYPE_GROUPS.some((group) =>
            group.types.some((type) => type === info.entityType),
          ),
      ),
    },
  ].filter((group) => group.types.length > 0);
  const openWorkspace = workspaces.find(
    (workspace) => workspace.id === input.activeWorkspace,
  );
  const currentArea = input.groupings?.active
    ? "library"
    : openWorkspace
      ? studioArea(null, openWorkspace)
      : studioArea(
          types.find((type) => type.entityType === active) ?? null,
          null,
        );
  const destination = input.groupings?.active
    ? `${MOBILE_GROUPING_PREFIX}${input.groupings.active}`
    : (input.activeWorkspace ?? active);
  const badges = input.workspaceBadges;
  const withBadge = (
    section: NavigationSection,
    badge: number | undefined,
  ): NavigationSection =>
    badge === undefined ? section : { ...section, badge };
  const sections: readonly NavigationSection[] = [
    withBadge(
      {
        id: "home",
        label: "Home",
        available: overviewWorkspace !== undefined || homeWorkspaces.length > 0,
      },
      sectionBadge([overviewWorkspace, ...homeWorkspaces], badges),
    ),
    withBadge(
      {
        id: "library",
        label: "Library",
        available:
          libraryTypeGroups.length > 0 ||
          emptyLibraryTypes.length > 0 ||
          libraryWorkspaces.length > 0 ||
          (input.groupings?.items.length ?? 0) > 0,
      },
      sectionBadge(libraryWorkspaces, badges),
    ),
    withBadge(
      {
        id: "publish",
        label: "Publish",
        available: publishWorkspaces.length > 0,
      },
      sectionBadge(publishWorkspaces, badges),
    ),
    withBadge(
      {
        id: "chat",
        label: "Chat",
        available: chatWorkspace !== undefined || chatWorkspaces.length > 0,
      },
      sectionBadge([chatWorkspace, ...chatWorkspaces], badges),
    ),
    withBadge(
      {
        id: "brain",
        label: "Brain",
        available: brainTypeGroups.length > 0 || brainWorkspaces.length > 0,
      },
      sectionBadge(brainWorkspaces, badges),
    ),
  ];
  return {
    types,
    active,
    overviewWorkspace,
    chatWorkspace,
    homeWorkspaces,
    chatWorkspaces,
    libraryTypeGroups,
    emptyLibraryTypes,
    libraryWorkspaces,
    publishWorkspaces,
    brainTypeGroups,
    brainWorkspaces,
    currentArea,
    destination,
    sections,
  };
}
