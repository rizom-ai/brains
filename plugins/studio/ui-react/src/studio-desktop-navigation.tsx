/** @jsxImportSource react */
import type { ReactElement } from "react";
import type { EntityTypeInfo, StudioWorkspaceInfo } from "./api";
import type { GroupingNavigation } from "./grouping-url-query";
import type { StudioArea } from "./studio-areas";
import {
  LEAF_AREAS,
  type NavigationModel,
  type NavigationTypeGroup,
} from "./studio-navigation-model";
import { navigationTypeLabel } from "./studio-navigation-parts";
import {
  setStudioNavigationCollapsed,
  useStudioNavigationCollapsed,
} from "./studio-navigation-state";
import {
  navigationClassName as navClass,
  navigationStyles as nav,
} from "./studio-navigation.styles";
import { typographyStyles } from "./studio-typography.styles";
import type { NavigationTree } from "./use-navigation-tree";

const areaMarks: Record<StudioArea, string> = {
  overview: "M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z",
  chat: "M5 4h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9l-5 3v-3a2 2 0 0 1-2-2V6a2 2 0 0 1 3-2z",
  library:
    "M12 5v16 M12 5C9 3 5 3 2 4v15c3-1 7-1 10 2 3-3 7-3 10-2V4c-3-1-7-1-10 1z",
  work: "M8 7V4h8v3 M3 7h18v14H3z M3 12l9 3 9-3 M10 14v3h4v-3",
  administration: "M12 2l9 4v6c0 5-4 8-9 10-5-2-9-5-9-10V6z M8 12l3 3 5-6",
  system:
    "M5 3v6m0 4v8 M12 3v11m0 4v3 M19 3v2m0 4v12 M2 9h6v4H2z M9 14h6v4H9z M16 5h6v4h-6z",
};

/** An area's icon, which stands in for its index while the rail is collapsed. */
function StudioAreaMark({ area }: { area: StudioArea }): ReactElement {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={areaMarks[area]} />
    </svg>
  );
}

/** One destination in the leaf panel: a type, a workspace or a grouping. */
function LeafLink(props: {
  label: string;
  active: boolean;
  onSelect: () => void;
  count?: number | undefined;
  /** The count asks for attention rather than totalling entries. */
  attention?: boolean;
}): ReactElement {
  return (
    <li>
      <button
        type="button"
        className={navClass(
          props.active ? "studio-leaf-link active" : "studio-leaf-link",
          nav.leafLink,
          props.active && nav.leafActive,
        )}
        aria-current={props.active ? "page" : undefined}
        onClick={props.onSelect}
      >
        {props.label}
        {props.count !== undefined && (
          <span
            className={navClass(
              props.attention ? "count count--attention" : "count",
              nav.count,
            )}
          >
            {props.count}
          </span>
        )}
      </button>
    </li>
  );
}

function LeafGroup(props: {
  label: string;
  children: ReactElement[];
}): ReactElement {
  return (
    <section className={navClass("studio-leaf-group", nav.leafGroup)}>
      <div
        className={navClass(
          "studio-leaf-label",
          nav.leafLabel,
          typographyStyles.eyebrow,
        )}
      >
        {props.label}
      </div>
      <ul className={navClass("", nav.list)}>{props.children}</ul>
    </section>
  );
}

/**
 * The desktop rail: Studio's areas, and beside them the leaf of whichever
 * area has destinations of its own. It shares its browsing state with the
 * phone sheet through the navigation tree.
 */
export function DesktopNavigation(props: {
  model: NavigationModel;
  tree: NavigationTree;
  active: string | null;
  onSelect: (entityType: string) => void;
  groupings?: GroupingNavigation | undefined;
  activeWorkspace?: string | null | undefined;
  workspaceBadges?: Record<string, number> | undefined;
  onSelectWorkspace?: ((workspaceId: string) => void) | undefined;
}): ReactElement {
  const collapsed = useStudioNavigationCollapsed();
  const { areas, primaryTypeGroups, secondaryTypeGroups, operationWorkspaces } =
    props.model;
  const { activeArea, leafOpen, leafId, selectArea } = props.tree;
  const activeAreaLabel = areas.find((area) => area.id === activeArea)?.label;

  const typeGroup = (group: NavigationTypeGroup): ReactElement => (
    <LeafGroup key={group.label} label={group.label}>
      {group.types.map((info: EntityTypeInfo) => (
        <LeafLink
          key={info.entityType}
          label={navigationTypeLabel(info)}
          active={info.entityType === props.active}
          onSelect={() => props.onSelect(info.entityType)}
          count={info.isSingleton ? undefined : info.count}
        />
      ))}
    </LeafGroup>
  );
  const workspaceLink = (workspace: StudioWorkspaceInfo): ReactElement => {
    const badge = props.workspaceBadges?.[workspace.id] ?? 0;
    return (
      <LeafLink
        key={workspace.id}
        label={workspace.label}
        active={workspace.id === props.activeWorkspace}
        onSelect={() => props.onSelectWorkspace?.(workspace.id)}
        count={badge > 0 ? badge : undefined}
        attention
      />
    );
  };

  return (
    <nav
      className={navClass(
        "types studio-navigation",
        nav.navigation,
        !leafOpen && nav.navigationDirect,
        collapsed && nav.navigationCollapsed,
      )}
      data-leaf-open={leafOpen}
      aria-label="Studio navigation"
    >
      <section
        className={navClass("studio-area-rail", nav.areaRail)}
        aria-label="Studio areas"
      >
        <div
          className={navClass(
            "studio-area-title",
            nav.areaTitle,
            typographyStyles.eyebrow,
            collapsed && nav.collapsedTitle,
          )}
        >
          <span className={navClass("", collapsed && nav.collapsedLabel)}>
            Studio
          </span>
          <button
            type="button"
            className={navClass(
              "studio-navigation-collapse",
              nav.collapseButton,
            )}
            aria-label={collapsed ? "Expand navigation" : "Collapse navigation"}
            title={collapsed ? "Expand navigation" : "Collapse navigation"}
            aria-expanded={!collapsed}
            aria-controls={leafOpen ? leafId : undefined}
            onClick={() => setStudioNavigationCollapsed(!collapsed)}
          >
            {collapsed ? "⇥" : "⇤"}
          </button>
        </div>
        {areas
          .filter(
            (area) =>
              area.available || !["chat", "administration"].includes(area.id),
          )
          .map((area) => (
            <button
              className={navClass(
                area.id === activeArea
                  ? "studio-area-link active"
                  : "studio-area-link",
                nav.areaLink,
                area.id === activeArea && nav.areaActive,
                collapsed && nav.collapsedLink,
              )}
              type="button"
              disabled={!area.available}
              aria-label={area.accessibleLabel ?? area.label}
              title={
                collapsed ? (area.accessibleLabel ?? area.label) : undefined
              }
              aria-pressed={area.id === activeArea}
              aria-description={
                (area.badge ?? 0) > 0
                  ? `${area.badge} need attention`
                  : undefined
              }
              aria-controls={
                leafOpen && LEAF_AREAS.includes(area.id) ? leafId : undefined
              }
              aria-expanded={
                LEAF_AREAS.includes(area.id)
                  ? leafOpen && !collapsed && area.id === activeArea
                  : undefined
              }
              key={area.id}
              onClick={() => selectArea(area.id)}
            >
              <b
                className={navClass(
                  "",
                  nav.ordinal,
                  area.id === activeArea && nav.ordinalActive,
                )}
              >
                {collapsed ? <StudioAreaMark area={area.id} /> : area.index}
              </b>
              <span
                data-area-label={area.label}
                className={navClass(
                  "",
                  nav.areaLabel,
                  collapsed && nav.collapsedLabel,
                )}
              >
                {area.label}
                {(area.badge ?? 0) > 0 ? (
                  <small className={navClass("", nav.count)}>
                    {area.badge}
                  </small>
                ) : null}
              </span>
            </button>
          ))}
        <div className={navClass("", nav.areaFoot)}>
          <button
            type="button"
            className={navClass(
              "command-chip",
              nav.areaLink,
              collapsed && nav.collapsedLink,
            )}
            aria-label="Commands"
            title={collapsed ? "Commands" : undefined}
          >
            <b className={navClass("", nav.ordinal)}>⌘</b>
            <span className={navClass("", collapsed && nav.collapsedLabel)}>
              Commands
            </span>
          </button>
        </div>
      </section>
      {leafOpen ? (
        <section
          id={leafId}
          className={navClass(
            "studio-leaf-rail",
            nav.leaf,
            collapsed && nav.collapsedLabel,
          )}
          aria-label={`${activeAreaLabel ?? "Studio"} destinations`}
        >
          <header className={navClass("studio-leaf-head", nav.leafHead)}>
            <h2
              className={navClass(
                "",
                nav.leafTitle,
                typographyStyles.secondaryDisplay,
              )}
            >
              {activeAreaLabel}
            </h2>
          </header>
          <div className={navClass("studio-leaf-scroll", nav.leafScroll)}>
            {activeArea === "library" ? (
              <>
                {primaryTypeGroups.map(typeGroup)}
                {(props.groupings?.items.length ?? 0) > 0 ? (
                  <LeafGroup label="Groups">
                    {(props.groupings?.items ?? []).map((grouping) => (
                      <LeafLink
                        key={grouping.key}
                        label={grouping.label}
                        active={grouping.key === props.groupings?.active}
                        onSelect={() => props.groupings?.onSelect(grouping.key)}
                      />
                    ))}
                  </LeafGroup>
                ) : null}
              </>
            ) : null}
            {activeArea === "work" && operationWorkspaces.length > 0 ? (
              <LeafGroup label="Workspaces">
                {operationWorkspaces.map(workspaceLink)}
              </LeafGroup>
            ) : null}
            {activeArea === "system"
              ? secondaryTypeGroups.map(typeGroup)
              : null}
          </div>
        </section>
      ) : null}
    </nav>
  );
}
