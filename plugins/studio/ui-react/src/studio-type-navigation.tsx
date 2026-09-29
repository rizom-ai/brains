/** @jsxImportSource react */
import { type ReactElement } from "react";
import type { StudioWorkspaceInfo, EntityTypeInfo } from "./api";
import type { GroupingNavigation } from "./grouping-url-query";
import { SITE_ENTITY_TYPES, SYSTEM_TYPE_GROUPS } from "./studio-areas";
export { studioArea, type StudioArea } from "./studio-areas";
export {
  StudioBrowseDestinations,
  studioMobileSelection,
} from "./studio-navigation-parts";
export type { MobileNavigationOption } from "./studio-navigation-parts";
import { DesktopNavigation } from "./studio-desktop-navigation";
import { MobileNavigation } from "./studio-mobile-navigation";
import { deriveNavigationModel } from "./studio-navigation-model";
import { useNavigationTree } from "./use-navigation-tree";

export type StudioEditorPresentation = "form" | "document" | "split";

export function studioEditorPresentation(
  entityType: string,
  hasBody: boolean,
): StudioEditorPresentation {
  if (!hasBody || SITE_ENTITY_TYPES.has(entityType)) return "form";
  return (
    SYSTEM_TYPE_GROUPS.find((group) =>
      group.types.some((type) => type === entityType),
    )?.presentation ?? "split"
  );
}

/**
 * Studio's navigation: the desktop rail, the phone sheet, or both. The two
 * read one navigation model and share one browsing state, so opening a group
 * in either leaves the other showing the same place.
 */
export function TypeSwitcher(props: {
  groupings?: GroupingNavigation | undefined;
  types: EntityTypeInfo[];
  active: string | null;
  onSelect: (entityType: string) => void;
  workspaces?: StudioWorkspaceInfo[];
  activeWorkspace?: string | null;
  workspaceBadges?: Record<string, number>;
  onSelectWorkspace?: (workspaceId: string) => void;
  renderMode?: "all" | "mobile" | "desktop";
}): ReactElement {
  const model = deriveNavigationModel(props);
  const tree = useNavigationTree({
    currentArea: model.currentArea,
    destination: model.destination,
    activeWorkspace: props.activeWorkspace,
    areaWorkspaces: [
      model.overviewWorkspace,
      model.chatWorkspace,
      model.administrationWorkspace,
    ],
    onSelectWorkspace: props.onSelectWorkspace,
  });
  return (
    <>
      {props.renderMode !== "desktop" ? (
        <MobileNavigation
          types={props.types}
          active={props.active}
          onSelect={props.onSelect}
          groupings={props.groupings}
          activeWorkspace={props.activeWorkspace}
          workspaceBadges={props.workspaceBadges}
          onSelectWorkspace={props.onSelectWorkspace}
          model={model}
          tree={tree}
        />
      ) : null}
      {props.renderMode !== "mobile" ? (
        <DesktopNavigation
          model={model}
          tree={tree}
          active={props.active}
          onSelect={props.onSelect}
          groupings={props.groupings}
          activeWorkspace={props.activeWorkspace}
          workspaceBadges={props.workspaceBadges}
          onSelectWorkspace={props.onSelectWorkspace}
        />
      ) : null}
    </>
  );
}
