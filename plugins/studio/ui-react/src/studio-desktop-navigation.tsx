/** @jsxImportSource react */
import type { ReactElement } from "react";
import {
  studioCollectionPath,
  studioGroupingPath,
  studioImagesPath,
} from "../../src/studio-paths";
import { isPlainLinkClick } from "./link-click";
import { getStudioRouterBasePath, studioWorkspaceHref } from "./studio-router";
import type { EntityTypeInfo, StudioWorkspaceInfo } from "./api";
import type {
  GroupingNavigation,
  ImagesNavigation,
} from "./grouping-url-query";
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
  home: "M3 11l9-7 9 7 M5 10v10h14V10 M10 20v-6h4v6",
  library:
    "M12 5v16 M12 5C9 3 5 3 2 4v15c3-1 7-1 10 2 3-3 7-3 10-2V4c-3-1-7-1-10 1z",
  publish: "M12 3v12 M7 8l5-5 5 5 M4 15v5h16v-5",
  chat: "M5 4h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9l-5 3v-3a2 2 0 0 1-2-2V6a2 2 0 0 1 3-2z",
  brain:
    "M9 4a3 3 0 0 0-3 3 3 3 0 0 0-2 5 3 3 0 0 0 2 5 3 3 0 0 0 6 1V5a3 3 0 0 0-3-1z M15 4a3 3 0 0 1 3 3 3 3 0 0 1 2 5 3 3 0 0 1-2 5 3 3 0 0 1-6 1",
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
  /** Where the destination lives, so it opens in a new tab like any link. */
  href: string;
  onSelect: () => void;
  count?: number | undefined;
  /** The count asks for attention rather than totalling entries. */
  attention?: boolean;
}): ReactElement {
  return (
    <li>
      <a
        href={props.href}
        className={navClass(
          props.active ? "studio-leaf-link active" : "studio-leaf-link",
          nav.leafLink,
          props.active && nav.leafActive,
        )}
        aria-current={props.active ? "page" : undefined}
        onClick={(event) => {
          if (!isPlainLinkClick(event)) return;
          event.preventDefault();
          props.onSelect();
        }}
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
      </a>
    </li>
  );
}

function LeafGroup(props: {
  /** None where the section holds only this list. */
  label?: string | undefined;
  children: ReactElement[];
}): ReactElement {
  return (
    <section className={navClass("studio-leaf-group", nav.leafGroup)}>
      {props.label ? (
        <div
          className={navClass(
            "studio-leaf-label",
            nav.leafLabel,
            typographyStyles.eyebrow,
          )}
        >
          {props.label}
        </div>
      ) : null}
      <ul className={navClass("", nav.list)}>{props.children}</ul>
    </section>
  );
}

/**
 * Studio's sidebar: its five sections, and under the one you are in (or
 * browsing) the destinations it holds. It shares its browsing state with the
 * phone sheet through the navigation tree.
 */
export function DesktopNavigation(props: {
  model: NavigationModel;
  tree: NavigationTree;
  active: string | null;
  onSelect: (entityType: string) => void;
  groupings?: GroupingNavigation | undefined;
  images?: ImagesNavigation | undefined;
  activeWorkspace?: string | null | undefined;
  workspaceBadges?: Record<string, number> | undefined;
  onSelectWorkspace?: ((workspaceId: string) => void) | undefined;
  /** An entry is open: fold to the icons unless a section is being browsed. */
  focus?: boolean | undefined;
}): ReactElement {
  const preferred = useStudioNavigationCollapsed();
  // Focus is presentation only: the stored preference is left as it is.
  const focused = props.focus === true && !props.tree.browsing;
  const collapsed = preferred || focused;
  const model = props.model;
  const { sections } = model;
  const { activeArea, leafOpen, leafId, selectArea, endBrowsing } = props.tree;
  // With an entry open the fold control starts and ends a browse; elsewhere
  // it is the stored preference.
  const toggleFold = (): void => {
    if (props.focus === true && !preferred) {
      if (props.tree.browsing) endBrowsing();
      else if (activeArea) selectArea(activeArea);
      return;
    }
    setStudioNavigationCollapsed(!collapsed);
  };
  const basePath = getStudioRouterBasePath();

  const typeGroup = (group: NavigationTypeGroup): ReactElement => (
    <LeafGroup key={group.label} label={group.label}>
      {group.types.map((info: EntityTypeInfo) => (
        <LeafLink
          key={info.entityType}
          label={navigationTypeLabel(info)}
          active={info.entityType === props.active}
          href={studioCollectionPath(basePath, info.entityType)}
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
        href={studioWorkspaceHref(basePath, workspace.id)}
        onSelect={() => props.onSelectWorkspace?.(workspace.id)}
        count={badge > 0 ? badge : undefined}
        attention
      />
    );
  };
  const workspaceGroup = (
    label: string | undefined,
    workspaces: StudioWorkspaceInfo[],
  ): ReactElement | null =>
    workspaces.length > 0 ? (
      <LeafGroup key={label ?? "pages"} label={label}>
        {workspaces.map(workspaceLink)}
      </LeafGroup>
    ) : null;

  /** What a section holds, listed under its heading. */
  const sectionList = (area: StudioArea): ReactElement | null => {
    switch (area) {
      case "home":
        return workspaceGroup(undefined, model.homeWorkspaces);
      case "library":
        return (
          <>
            {model.libraryTypeGroups.map(typeGroup)}
            {model.emptyLibraryTypes.length > 0 ? (
              <details className={navClass("", nav.allTypes)}>
                <summary
                  className={navClass("", nav.leafLabel, nav.allTypesSummary)}
                >
                  All types
                </summary>
                <ul className={navClass("", nav.list)}>
                  {model.emptyLibraryTypes.map((info) => (
                    <LeafLink
                      key={info.entityType}
                      label={navigationTypeLabel(info)}
                      active={false}
                      href={studioCollectionPath(basePath, info.entityType)}
                      onSelect={() => props.onSelect(info.entityType)}
                    />
                  ))}
                </ul>
              </details>
            ) : null}
            {(props.groupings?.items.length ?? 0) > 0 ? (
              <LeafGroup label="Groups">
                {(props.groupings?.items ?? []).map((grouping) => (
                  <LeafLink
                    key={grouping.key}
                    label={grouping.label}
                    active={grouping.key === props.groupings?.active}
                    href={studioGroupingPath(basePath, grouping.key)}
                    onSelect={() => props.groupings?.onSelect(grouping.key)}
                  />
                ))}
              </LeafGroup>
            ) : null}
            {props.images ? (
              <LeafGroup label="Media">
                {[
                  <LeafLink
                    key="images"
                    label="Images"
                    active={props.images.active}
                    href={studioImagesPath(basePath)}
                    onSelect={props.images.onSelect}
                  />,
                ]}
              </LeafGroup>
            ) : null}
            {workspaceGroup("Pages", model.libraryWorkspaces)}
          </>
        );
      case "publish":
        return workspaceGroup(undefined, model.publishWorkspaces);
      case "brain":
        return (
          <>
            {model.brainTypeGroups.map(typeGroup)}
            {workspaceGroup("Pages", model.brainWorkspaces)}
          </>
        );
      case "chat":
        return null;
    }
  };

  return (
    <nav
      className={navClass(
        "types studio-navigation",
        nav.navigation,
        collapsed && nav.navigationCollapsed,
      )}
      data-leaf-open={leafOpen}
      data-collapsed={collapsed}
      aria-label="Studio navigation"
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
          className={navClass("studio-navigation-collapse", nav.collapseButton)}
          aria-label={collapsed ? "Expand navigation" : "Collapse navigation"}
          title={collapsed ? "Expand navigation" : "Collapse navigation"}
          aria-expanded={!collapsed}
          aria-controls={leafOpen && !collapsed ? leafId : undefined}
          onClick={toggleFold}
        >
          {collapsed ? "⇥" : "⇤"}
        </button>
      </div>
      <div className={navClass("studio-leaf-scroll", nav.leafScroll)}>
        {sections
          .filter((section) => section.available)
          .map((section) => {
            const current = section.id === activeArea;
            const listed =
              current &&
              leafOpen &&
              !collapsed &&
              LEAF_AREAS.includes(section.id);
            return (
              <section
                key={section.id}
                aria-label={section.label}
                className={navClass("studio-area", nav.section)}
              >
                <button
                  className={navClass(
                    current ? "studio-area-link active" : "studio-area-link",
                    nav.areaLink,
                    current && nav.areaActive,
                    collapsed && nav.collapsedLink,
                  )}
                  type="button"
                  aria-label={section.label}
                  title={collapsed ? section.label : undefined}
                  aria-pressed={current}
                  aria-description={
                    (section.badge ?? 0) > 0
                      ? `${section.badge} need attention`
                      : undefined
                  }
                  aria-controls={listed ? leafId : undefined}
                  aria-expanded={section.id === "chat" ? undefined : listed}
                  onClick={() => selectArea(section.id)}
                >
                  <b
                    className={navClass(
                      "",
                      nav.ordinal,
                      current && nav.ordinalActive,
                    )}
                  >
                    <StudioAreaMark area={section.id} />
                  </b>
                  <span
                    data-area-label={section.label}
                    className={navClass(
                      "",
                      nav.areaLabel,
                      collapsed && nav.collapsedLabel,
                    )}
                  >
                    {section.label}
                    {(section.badge ?? 0) > 0 ? (
                      <small className={navClass("", nav.count)}>
                        {section.badge}
                      </small>
                    ) : null}
                  </span>
                </button>
                {listed ? (
                  <div
                    id={leafId}
                    className={navClass("studio-leaf-rail", nav.leaf)}
                    aria-label={`${section.label} destinations`}
                    role="group"
                  >
                    {sectionList(section.id)}
                  </div>
                ) : null}
              </section>
            );
          })}
      </div>
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
    </nav>
  );
}
