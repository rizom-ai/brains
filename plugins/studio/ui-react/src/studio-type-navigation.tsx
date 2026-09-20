/** @jsxImportSource react */
import { typographyStyles } from "./studio-typography.styles";
import { type ReactElement } from "react";
import {
  useStudioNavigationCollapsed,
  setStudioNavigationCollapsed,
} from "./studio-navigation-state";
import type { StudioWorkspaceInfo, EntityTypeInfo } from "./api";
import {
  studioArea,
  studioTypeGroup,
  SITE_ENTITY_TYPES,
  SYSTEM_TYPE_GROUPS,
  type StudioArea,
} from "./studio-areas";
export { studioArea, type StudioArea } from "./studio-areas";
export {
  StudioBrowseDestinations,
  studioMobileSelection,
} from "./studio-navigation-parts";
export type { MobileNavigationOption } from "./studio-navigation-parts";
import { navigationTypeLabel, workspaceBadge } from "./studio-navigation-parts";
import { MobileNavigation } from "./studio-mobile-navigation";
import { useNavigationTree } from "./use-navigation-tree";
import {
  navigationClassName as navClass,
  navigationStyles as nav,
} from "./studio-navigation.styles";

// Brain machinery: operator-editable, but not authored content. These live
// in their own rail group so a full brain doesn't flood "Content".

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

/** Areas that are one destination, not a group of them. */

/**
 * The Browse sheet's contents, independent of the dialog that carries them:
 * one block of direct destinations above independently collapsible groups,
 * narrowed by a filter. Selecting a destination is the caller's business, so
 * this renders and reports, and closes nothing itself.
 */

export function TypeSwitcher(props: {
  types: EntityTypeInfo[];
  active: string | null;
  onSelect: (entityType: string) => void;
  workspaces?: StudioWorkspaceInfo[];
  activeWorkspace?: string | null;
  workspaceBadges?: Record<string, number>;
  onSelectWorkspace?: (workspaceId: string) => void;
  renderMode?: "all" | "mobile" | "desktop";
}): ReactElement {
  const collapsed = useStudioNavigationCollapsed();
  const overviewWorkspace = props.workspaces?.find(
    (workspace) => workspace.id === "studio:overview",
  );
  const chatWorkspace = props.workspaces?.find(
    (workspace) => studioArea(null, workspace.id) === "chat",
  );
  const administrationWorkspace = props.workspaces?.find(
    (workspace) => studioArea(null, workspace.id) === "administration",
  );
  const operationWorkspaces =
    props.workspaces?.filter(
      (workspace) => studioArea(null, workspace.id) === "work",
    ) ?? [];
  const groups = (["Content", "Collections", "Site", "System"] as const)
    .map((label) => ({
      label,
      types: props.types.filter(
        (info) => studioTypeGroup(info.entityType) === label,
      ),
    }))
    .filter((group) => group.types.length > 0);
  const primaryTypeGroups = groups.filter(
    (group) => group.label === "Content" || group.label === "Collections",
  );
  const systemTypes = (ids: string[]): EntityTypeInfo[] =>
    ids.flatMap((id) => props.types.filter((info) => info.entityType === id));
  const secondaryTypeGroups = [
    ...SYSTEM_TYPE_GROUPS.map((group) => ({
      label: group.label,
      types: systemTypes([...group.types]),
    })),
    ...groups.filter((group) => group.label === "Site"),
  ].filter((group) => group.types.length > 0);
  const currentArea = studioArea(props.active, props.activeWorkspace ?? null);
  const destination = props.activeWorkspace ?? props.active;
  const tree = useNavigationTree({
    currentArea,
    destination,
    activeWorkspace: props.activeWorkspace,
    areaWorkspaces: [overviewWorkspace, chatWorkspace, administrationWorkspace],
    onSelectWorkspace: props.onSelectWorkspace,
  });
  const { activeArea, leafOpen, leafId, selectArea } = tree;
  const renderGroup = (group: {
    label: string;
    types: EntityTypeInfo[];
  }): ReactElement => (
    <section
      className={navClass("studio-leaf-group", nav.leafGroup)}
      key={group.label}
    >
      <div
        className={navClass(
          "studio-leaf-label",
          nav.leafLabel,
          typographyStyles.eyebrow,
        )}
      >
        {group.label}
      </div>
      <ul className={navClass("", nav.list)}>
        {group.types.map((info) => (
          <li key={info.entityType}>
            <button
              type="button"
              className={navClass(
                info.entityType === props.active
                  ? "studio-leaf-link active"
                  : "studio-leaf-link",
                nav.leafLink,
                info.entityType === props.active && nav.leafActive,
              )}
              aria-current={
                info.entityType === props.active ? "page" : undefined
              }
              onClick={() => props.onSelect(info.entityType)}
            >
              {navigationTypeLabel(info)}
              {!info.isSingleton && (
                <span className={navClass("count", nav.count)}>
                  {info.count}
                </span>
              )}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
  const renderWorkspaceLink = (
    workspace: StudioWorkspaceInfo,
  ): ReactElement => (
    <li key={workspace.id}>
      <button
        type="button"
        className={navClass(
          workspace.id === props.activeWorkspace
            ? "studio-leaf-link active"
            : "studio-leaf-link",
          nav.leafLink,
          workspace.id === props.activeWorkspace && nav.leafActive,
        )}
        aria-current={
          workspace.id === props.activeWorkspace ? "page" : undefined
        }
        onClick={() => props.onSelectWorkspace?.(workspace.id)}
      >
        {workspace.label}
        {(props.workspaceBadges?.[workspace.id] ?? 0) > 0 && (
          <span className={navClass("count count--attention", nav.count)}>
            {props.workspaceBadges?.[workspace.id]}
          </span>
        )}
      </button>
    </li>
  );
  const areas: readonly {
    id: StudioArea;
    index: string;
    label: string;
    available: boolean;
    accessibleLabel?: string;
    badge?: number;
  }[] = [
    {
      id: "overview",
      index: "00",
      label: "Overview",
      available: overviewWorkspace !== undefined,
      badge: workspaceBadge(overviewWorkspace, props.workspaceBadges),
    },
    {
      id: "chat",
      index: "01",
      label: "Chat",
      available: chatWorkspace !== undefined,
      badge: workspaceBadge(chatWorkspace, props.workspaceBadges),
    },
    {
      id: "library",
      index: "02",
      label: "Library",
      available: primaryTypeGroups.length > 0,
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
      badge: workspaceBadge(administrationWorkspace, props.workspaceBadges),
    },
    {
      id: "system",
      index: "05",
      label: "System",
      available: secondaryTypeGroups.length > 0,
    },
  ];
  return (
    <>
      {props.renderMode !== "desktop" ? (
        <MobileNavigation
          types={props.types}
          active={props.active}
          onSelect={props.onSelect}
          activeWorkspace={props.activeWorkspace}
          workspaceBadges={props.workspaceBadges}
          onSelectWorkspace={props.onSelectWorkspace}
          overviewWorkspace={overviewWorkspace}
          chatWorkspace={chatWorkspace}
          administrationWorkspace={administrationWorkspace}
          operationWorkspaces={operationWorkspaces}
          primaryTypeGroups={primaryTypeGroups}
          secondaryTypeGroups={secondaryTypeGroups}
          tree={tree}
        />
      ) : null}
      {props.renderMode !== "mobile" ? (
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
                aria-label={
                  collapsed ? "Expand navigation" : "Collapse navigation"
                }
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
                  area.available ||
                  !["chat", "administration"].includes(area.id),
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
                    leafOpen && ["library", "work", "system"].includes(area.id)
                      ? leafId
                      : undefined
                  }
                  aria-expanded={
                    ["library", "work", "system"].includes(area.id)
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
              aria-label={`${areas.find((area) => area.id === activeArea)?.label ?? "Studio"} destinations`}
            >
              <header className={navClass("studio-leaf-head", nav.leafHead)}>
                <h2
                  className={navClass(
                    "",
                    nav.leafTitle,
                    typographyStyles.secondaryDisplay,
                  )}
                >
                  {areas.find((area) => area.id === activeArea)?.label}
                </h2>
              </header>
              <div className={navClass("studio-leaf-scroll", nav.leafScroll)}>
                {activeArea === "library"
                  ? primaryTypeGroups.map(renderGroup)
                  : null}
                {activeArea === "work" && operationWorkspaces.length > 0 ? (
                  <section
                    className={navClass("studio-leaf-group", nav.leafGroup)}
                  >
                    <div
                      className={navClass(
                        "studio-leaf-label",
                        nav.leafLabel,
                        typographyStyles.eyebrow,
                      )}
                    >
                      Workspaces
                    </div>
                    <ul className={navClass("", nav.list)}>
                      {operationWorkspaces.map(renderWorkspaceLink)}
                    </ul>
                  </section>
                ) : null}
                {activeArea === "system"
                  ? secondaryTypeGroups.map(renderGroup)
                  : null}
              </div>
            </section>
          ) : null}
        </nav>
      ) : null}
    </>
  );
}
