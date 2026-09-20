import { useId, useState } from "react";
import type { StudioWorkspaceInfo } from "./api";
import { setStudioNavigationCollapsed } from "./studio-navigation-state";
import { studioArea, type StudioArea } from "./studio-type-navigation";

export interface NavigationTreeInput {
  /** The area the open destination belongs to. */
  currentArea: StudioArea | null;
  /** The open entity type or workspace; a change resets browsing. */
  destination: string | null;
  activeWorkspace: string | null | undefined;
  /** Workspaces that are an area in their own right, rather than a leaf. */
  areaWorkspaces: (StudioWorkspaceInfo | undefined)[];
  onSelectWorkspace: ((workspaceId: string) => void) | undefined;
}

export interface NavigationTree {
  /** The area being shown, which is not necessarily the one you are in. */
  activeArea: StudioArea | null;
  /** Whether this area has a list of destinations under it. */
  leafOpen: boolean;
  /** Stable id tying the area buttons to the leaf list they control. */
  leafId: string;
  selectArea: (area: StudioArea) => void;
  openGroups: Record<string, boolean>;
  toggleGroup: (area: string, open: boolean) => void;
}

const AREAS_WITH_LEAVES: StudioArea[] = ["library", "work", "system"];

/**
 * Which part of the Studio the navigation is showing.
 *
 * Browsing is not navigating. Opening an area looks at what is in it without
 * leaving the destination you are on, so an unsaved draft survives a look
 * around. Only an area that *is* a workspace — chat, overview, administration
 * — navigates, because there is nothing to browse under it.
 *
 * Both the phone sheet and the desktop rail read this, which is why it is a
 * hook rather than state inside either of them.
 */
export function useNavigationTree(input: NavigationTreeInput): NavigationTree {
  const { currentArea, destination, activeWorkspace, areaWorkspaces } = input;
  const [browsingArea, setBrowsingArea] = useState<StudioArea | null>(null);
  const [lastDestination, setLastDestination] = useState(destination);

  // Set during render on purpose: a destination change — including Back and
  // Forward, which no click here can observe — must show that destination's
  // own area on the same paint, not after a flash of the old one.
  if (destination !== lastDestination) {
    setLastDestination(destination);
    setBrowsingArea(null);
  }

  const activeArea = browsingArea ?? currentArea;
  const leafId = useId();

  const selectArea = (area: StudioArea): void => {
    const destinationWorkspace = areaWorkspaces.find(
      (workspace) => workspace && studioArea(null, workspace.id) === area,
    );
    if (destinationWorkspace) {
      if (destinationWorkspace.id === activeWorkspace) setBrowsingArea(null);
      else input.onSelectWorkspace?.(destinationWorkspace.id);
      return;
    }
    setStudioNavigationCollapsed(false);
    setBrowsingArea(area);
  };

  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(
    currentArea ? { [currentArea]: true } : {},
  );
  const toggleGroup = (area: string, open: boolean): void => {
    setOpenGroups((previous) =>
      previous[area] === open ? previous : { ...previous, [area]: open },
    );
  };

  return {
    activeArea,
    leafOpen: activeArea !== null && AREAS_WITH_LEAVES.includes(activeArea),
    leafId,
    selectArea,
    openGroups,
    toggleGroup,
  };
}
