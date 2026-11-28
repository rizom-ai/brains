/** @jsxImportSource react */
import { useState, type ReactElement } from "react";
import {
  Dialog,
  DialogClose,
  DialogPortal,
  DialogTrigger,
} from "@brains/app-ui-react";
import { Dialog as DialogPrimitive, VisuallyHidden } from "radix-ui";
import type { EntityTypeInfo, StudioWorkspaceInfo } from "./api";
import type {
  GroupingNavigation,
  ImagesNavigation,
} from "./grouping-url-query";
import {
  navigationClassName as navClass,
  navigationStyles as nav,
} from "./studio-navigation.styles";
import { typographyStyles } from "./studio-typography.styles";
import {
  MOBILE_GROUPING_PREFIX,
  MOBILE_TYPE_PREFIX,
  MOBILE_WORKSPACE_PREFIX,
  StudioBrowseDestinations,
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
}

/**
 * The phone navigation: a browse sheet over the destinations the desktop rail
 * shows in place.
 *
 * It takes the navigation tree rather than building one. The sheet and the
 * rail are two views of the same browsing state, so opening a group in one
 * must not leave the other showing something else.
 *
 * Its own state — the sheet being open, and the filter typed into it — is
 * genuinely the sheet's, and is no longer computed when only the rail renders.
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
  const { leafId, openGroups, toggleGroup } = props.tree;
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
  const mobileGroups = [
    {
      area: "home",
      label: "Home",
      options: [
        ...(overviewWorkspace
          ? [mobileWorkspaceOption(overviewWorkspace)]
          : []),
        ...homeWorkspaces.map(mobileWorkspaceOption),
      ],
    },
    {
      area: "library",
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
      area: "publish",
      label: "Publish",
      options: publishWorkspaces.map(mobileWorkspaceOption),
    },
    {
      area: "chat",
      label: "Chat",
      options: [
        ...(chatWorkspace ? [mobileWorkspaceOption(chatWorkspace)] : []),
        ...chatWorkspaces.map(mobileWorkspaceOption),
      ],
    },
    {
      area: "brain",
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
  const [mobileFilter, setMobileFilter] = useState("");
  const [browseOpen, setBrowseOpen] = useState(false);
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
  return (
    <Dialog
      open={browseOpen}
      onOpenChange={(open) => {
        setBrowseOpen(open);
        if (open) setMobileFilter("");
      }}
    >
      <DialogTrigger asChild>
        <button
          type="button"
          className={navClass(
            "studio-mobile-switcher",
            nav.browse,
            typographyStyles.eyebrow,
          )}
          aria-label="Browse Studio"
        >
          <span aria-hidden="true">≡</span>
          Browse
        </button>
      </DialogTrigger>
      <DialogPortal>
        <DialogPrimitive.Overlay className={navClass("", nav.sheetOverlay)} />
        <DialogPrimitive.Content
          className={navClass("studio-mobile-navigation-sheet", nav.sheet)}
          aria-describedby={undefined}
          // Browse opens to be read. Focusing the filter would raise the
          // phone keyboard over the destinations every time.
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            if (event.currentTarget instanceof HTMLElement)
              event.currentTarget.focus();
          }}
        >
          <div
            className={navClass("studio-mobile-navigation-list", nav.sheetList)}
          >
            <VisuallyHidden.Root>
              <DialogPrimitive.Title>Browse Studio</DialogPrimitive.Title>
            </VisuallyHidden.Root>
            <StudioBrowseDestinations
              groups={mobileGroups}
              filter={mobileFilter}
              activeValue={activeMobileView}
              groupId={(area) => `${leafId}-${area}`}
              isGroupOpen={(area) => openGroups[area] !== false}
              onFilterChange={setMobileFilter}
              onToggleGroup={toggleGroup}
              onSelect={(value) => {
                selectMobileView(value);
                setBrowseOpen(false);
              }}
              trailing={
                <DialogClose
                  className={navClass("", nav.sheetClose)}
                  aria-label="Close browse"
                >
                  ✕
                </DialogClose>
              }
            />
          </div>
        </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>
  );
}
