/** @jsxImportSource react */
import type { ReactElement } from "react";
import type { EntityTypeInfo, StudioWorkspaceInfo } from "./api";
import type {
  GroupingNavigation,
  ImagesNavigation,
} from "./grouping-url-query";
import { phoneTabs, type PhoneTabGroup } from "./phone-tabs";
import { StudioTabBar } from "./studio-tab-bar";
import {
  MOBILE_GROUPING_PREFIX,
  MOBILE_TYPE_PREFIX,
  MOBILE_WORKSPACE_PREFIX,
  navigationTypeLabel,
  studioMobileSelection,
  workspaceBadge,
  type MobileNavigationOption,
} from "./studio-navigation-parts";
import type { NavigationTree } from "./use-navigation-tree";
import type { NavigationModel } from "./studio-navigation-model";
import {
  studioCollectionPath,
  studioGroupingPath,
  studioImagesPath,
} from "../../src/studio-paths";
import { getStudioRouterBasePath, studioWorkspaceHref } from "./studio-router";

const MOBILE_IMAGES_VALUE = "page:images";

export interface MobileNavigationProps {
  types: EntityTypeInfo[];
  active: string | null;
  onSelect: (entityType: string) => void;
  groupings?: GroupingNavigation | undefined;
  images?: ImagesNavigation | undefined;
  activeWorkspace?: string | null | undefined;
  workspaceBadges?: Record<string, number> | undefined;
  onSelectWorkspace?: ((workspaceId: string) => void) | undefined;
  /** The same destinations the desktop rail shows. */
  model: NavigationModel;
  /** Shared with the desktop rail: one browsing state, two views of it. */
  tree: NavigationTree;
  /** An entry is open, with its own bar and way back: no tab bar. */
  hidden?: boolean | undefined;
}

/**
 * The phone navigation: the five sections as a tab bar along the bottom, as
 * in the phone mockup, over the destinations the desktop rail shows in place.
 * The tree stays shared with the rail, one browsing state for both views.
 */
export function MobileNavigation(props: MobileNavigationProps): ReactElement {
  const {
    overviewWorkspace,
    chatWorkspace,
    homeWorkspaces,
    chatWorkspaces,
    libraryTypes,
    emptyLibraryTypes,
    libraryWorkspaces,
    publishWorkspaces,
    brainTypeGroups,
    brainWorkspaces,
  } = props.model;
  const basePath = getStudioRouterBasePath();
  const mobileTypeOption = (info: EntityTypeInfo): MobileNavigationOption => ({
    value: `${MOBILE_TYPE_PREFIX}${info.entityType}`,
    href: studioCollectionPath(basePath, info.entityType),
    label: navigationTypeLabel(info),
    ...(info.isSingleton ? {} : { tally: info.count }),
  });
  const mobileWorkspaceOption = (
    workspace: StudioWorkspaceInfo,
  ): MobileNavigationOption => {
    const attention = workspaceBadge(workspace, props.workspaceBadges);
    return {
      value: `${MOBILE_WORKSPACE_PREFIX}${workspace.id}`,
      href: studioWorkspaceHref(basePath, workspace.id),
      label: workspace.label,
      accessibleLabel: workspace.label,
      ...(attention > 0 ? { attention } : {}),
    };
  };
  // The five sections, each with what it holds; an empty one is left out.
  const mobileGroups: PhoneTabGroup[] = [
    {
      area: "home" as const,
      label: "Home",
      options: [
        ...(overviewWorkspace
          ? [mobileWorkspaceOption(overviewWorkspace)]
          : []),
        ...homeWorkspaces.map(mobileWorkspaceOption),
      ],
    },
    {
      area: "library" as const,
      label: "Library",
      options: [
        ...libraryTypes.map(mobileTypeOption),
        ...(props.groupings?.items ?? []).map((grouping) => ({
          value: `${MOBILE_GROUPING_PREFIX}${grouping.key}`,
          href: studioGroupingPath(basePath, grouping.key),
          label: grouping.label,
        })),
        ...(props.images
          ? [
              {
                value: MOBILE_IMAGES_VALUE,
                href: studioImagesPath(basePath),
                label: "Images",
              },
            ]
          : []),
        ...libraryWorkspaces.map(mobileWorkspaceOption),
        // Types with nothing in them yet come last.
        ...emptyLibraryTypes.map(mobileTypeOption),
      ],
    },
    {
      area: "publish" as const,
      label: "Publish",
      options: publishWorkspaces.map(mobileWorkspaceOption),
    },
    {
      area: "chat" as const,
      label: "Chat",
      options: [
        ...(chatWorkspace ? [mobileWorkspaceOption(chatWorkspace)] : []),
        ...chatWorkspaces.map(mobileWorkspaceOption),
      ],
    },
    {
      area: "brain" as const,
      label: "Brain",
      options: [
        ...brainTypeGroups.flatMap((group) =>
          group.types.map(mobileTypeOption),
        ),
        ...brainWorkspaces.map(mobileWorkspaceOption),
      ],
    },
  ].filter((group) => group.options.length > 0);
  const activeMobileView = props.images?.active
    ? MOBILE_IMAGES_VALUE
    : props.groupings?.active
      ? `${MOBILE_GROUPING_PREFIX}${props.groupings.active}`
      : props.active
        ? `${MOBILE_TYPE_PREFIX}${props.active}`
        : props.activeWorkspace
          ? `${MOBILE_WORKSPACE_PREFIX}${props.activeWorkspace}`
          : "";
  const selectMobileView = (value: string): void => {
    if (value === MOBILE_IMAGES_VALUE) {
      props.images?.onSelect();
      return;
    }
    const selection = studioMobileSelection(value);
    if (selection?.kind === "grouping") {
      props.groupings?.onSelect(selection.id);
      return;
    }
    if (selection?.kind === "type") {
      props.onSelect(selection.id);
      return;
    }
    if (
      selection?.kind === "workspace" &&
      selection.id !== props.activeWorkspace
    ) {
      props.onSelectWorkspace?.(selection.id);
    }
  };
  if (props.hidden) return <></>;
  return (
    <StudioTabBar
      tabs={phoneTabs(mobileGroups, activeMobileView)}
      activeValue={activeMobileView}
      onSelect={selectMobileView}
    />
  );
}
