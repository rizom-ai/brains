/** @jsxImportSource react */
import type { GroupingNavigation } from "./grouping-url-query";
import { singularLabel } from "./ui-utils";
import { typographyStyles } from "./studio-typography.styles";
import {
  Dialog,
  DialogClose,
  DialogPortal,
  DialogTrigger,
} from "@brains/app-ui-react";
import { useId, useState, type ReactElement, type ReactNode } from "react";
import {
  useStudioNavigationCollapsed,
  setStudioNavigationCollapsed,
} from "./studio-navigation-state";
import { Dialog as DialogPrimitive, VisuallyHidden } from "radix-ui";
import type { StudioWorkspaceInfo, EntityTypeInfo } from "./api";
import { StudioSearchField } from "./studio-search-field";
import {
  navigationClassName as navClass,
  navigationStyles as nav,
} from "./studio-navigation.styles";
import { STUDIO_CHAT_WORKSPACE_ID } from "../../src/chat-workspace";
import { STUDIO_ACCOUNT_WORKSPACE_ID } from "../../src/account-workspace";

function navigationTypeLabel(info: EntityTypeInfo): string {
  if (info.entityType === "grouping-vocabulary") return "Groupings";
  return info.isSingleton && info.entityType !== "settings"
    ? singularLabel(info.label)
    : info.label;
}

const COLLECTION_ENTITY_TYPES = new Set([
  "project",
  "projects",
  "series",
  "topic",
  "topics",
]);
const SITE_ENTITY_TYPES = new Set([
  "profile",
  "settings",
  "site-info",
  "siteInfo",
]);
// Brain machinery: operator-editable, but not authored content. These live
// in their own rail group so a full brain doesn't flood "Content".
const SYSTEM_TYPE_GROUPS = [
  { label: "Structure", presentation: "form", types: ["grouping-vocabulary"] },
  {
    label: "Identity",
    presentation: "form",
    types: ["anchor-profile", "brain-character", "style-guide"],
  },
  {
    label: "Intelligence",
    presentation: "document",
    types: [
      "prompt",
      "prompts",
      "skill",
      "skills",
      "playbook",
      "playbooks",
      "swot",
      "swots",
    ],
  },
  { label: "Network", presentation: "form", types: ["agent", "agents"] },
] as const;
const SYSTEM_ENTITY_TYPES = new Set<string>(
  SYSTEM_TYPE_GROUPS.flatMap((group) => [...group.types]),
);

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

function studioTypeGroup(
  entityType: string,
): "Content" | "Collections" | "Site" | "System" {
  if (SITE_ENTITY_TYPES.has(entityType)) return "Site";
  if (SYSTEM_ENTITY_TYPES.has(entityType)) return "System";
  if (COLLECTION_ENTITY_TYPES.has(entityType)) return "Collections";
  return "Content";
}

type StudioArea =
  "overview" | "chat" | "library" | "work" | "administration" | "system";

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

export function studioArea(
  entityType: string | null,
  workspaceId: string | null,
): StudioArea | null {
  // Navigation ownership, not renderer selection. Account has no owning rail area.
  if (workspaceId === "studio:overview") return "overview";
  if (workspaceId === STUDIO_CHAT_WORKSPACE_ID) return "chat";
  if (workspaceId === "admin:administration") return "administration";
  if (workspaceId === STUDIO_ACCOUNT_WORKSPACE_ID) return null;
  if (workspaceId) return "work";
  const group = entityType ? studioTypeGroup(entityType) : null;
  return group === "Site" || group === "System" ? "system" : "library";
}

interface MobileNavigationOption {
  value: string;
  label: string;
  /** How many items the destination holds. */
  tally?: number;
  /** How many of them need the operator. */
  attention?: number;
  accessibleLabel?: string;
}

/** Areas that are one destination, not a group of them. */
const DIRECT_MOBILE_AREAS = ["overview", "chat", "administration"];

interface MobileNavigationGroupModel {
  area: string;
  label: string;
  options: MobileNavigationOption[];
}

const MOBILE_TYPE_PREFIX = "type:";
const MOBILE_WORKSPACE_PREFIX = "workspace:";
const MOBILE_GROUPING_PREFIX = "group:";

export function studioMobileSelection(
  value: string,
): { kind: "type" | "workspace" | "grouping"; id: string } | null {
  if (value.startsWith(MOBILE_GROUPING_PREFIX)) {
    const id = value.slice(MOBILE_GROUPING_PREFIX.length);
    return id ? { kind: "grouping", id } : null;
  }
  if (value.startsWith(MOBILE_TYPE_PREFIX)) {
    const id = value.slice(MOBILE_TYPE_PREFIX.length);
    return id.length > 0 ? { kind: "type", id } : null;
  }
  if (value.startsWith(MOBILE_WORKSPACE_PREFIX)) {
    const id = value.slice(MOBILE_WORKSPACE_PREFIX.length);
    return id.length > 0 ? { kind: "workspace", id } : null;
  }
  return null;
}

function MobileNavigationGroup(props: {
  id: string;
  label: string;
  open: boolean;
  currentLabel?: string | undefined;
  onToggle: (open: boolean) => void;
  children: ReactNode;
}): ReactElement {
  return (
    <details
      id={props.id}
      className={navClass("studio-mobile-navigation-group", nav.mobileGroup)}
      open={props.open}
      onToggle={(event) => props.onToggle(event.currentTarget.open)}
    >
      <summary className={navClass("", nav.mobileSummary)}>
        <span aria-hidden="true" className={navClass("", nav.mobileDisclosure)}>
          ▾
        </span>
        <span
          className={navClass(
            "studio-mobile-group-name",
            nav.mobileGroupName,
            typographyStyles.section,
          )}
        >
          {props.label}
        </span>
        {!props.open && props.currentLabel ? (
          <span className={navClass("", nav.mobileCurrent)}>
            {props.currentLabel}
          </span>
        ) : null}
      </summary>
      {props.children}
    </details>
  );
}

/**
 * The Browse sheet's contents, independent of the dialog that carries them:
 * one block of direct destinations above independently collapsible groups,
 * narrowed by a filter. Selecting a destination is the caller's business, so
 * this renders and reports, and closes nothing itself.
 */
export function StudioBrowseDestinations(props: {
  groups: MobileNavigationGroupModel[];
  filter: string;
  activeValue: string;
  groupId: (area: string) => string;
  isGroupOpen: (area: string) => boolean;
  onFilterChange: (value: string) => void;
  onToggleGroup: (area: string, open: boolean) => void;
  onSelect: (value: string) => void;
  /** The dialog contributes its own way out; the list does not own one. */
  trailing?: ReactNode;
}): ReactElement {
  const query = props.filter.trim().toLowerCase();
  const matching = props.groups
    .map((group) => ({
      ...group,
      options: group.options.filter(
        (option) => query === "" || option.label.toLowerCase().includes(query),
      ),
    }))
    .filter((group) => group.options.length > 0);
  // Every single destination sits above the toggles: a lone row wedged
  // between two group headers reads as the tail of the group above it.
  const direct = matching
    .filter((group) => DIRECT_MOBILE_AREAS.includes(group.area))
    .flatMap((group) => group.options);
  const collapsible = matching.filter(
    (group) => !DIRECT_MOBILE_AREAS.includes(group.area),
  );
  const option = (
    entry: MobileNavigationOption,
    flush = false,
  ): ReactElement => (
    <button
      key={entry.value}
      className={navClass(
        entry.value === props.activeValue
          ? "studio-mobile-navigation-link active"
          : "studio-mobile-navigation-link",
        nav.mobileLink,
        flush && nav.mobileDirectLink,
        entry.value === props.activeValue && nav.mobileActive,
      )}
      type="button"
      aria-label={entry.accessibleLabel}
      aria-current={entry.value === props.activeValue ? "page" : undefined}
      onClick={() => props.onSelect(entry.value)}
    >
      {entry.label}
      {entry.attention === undefined ? null : (
        <span
          data-studio-attention=""
          className={navClass("", nav.mobileAttention)}
        >
          {entry.attention}
        </span>
      )}
      {entry.tally === undefined ? null : (
        <span data-studio-tally="" className={navClass("", nav.mobileTally)}>
          {entry.tally}
        </span>
      )}
    </button>
  );
  return (
    <>
      <header className={navClass("", nav.sheetHead)}>
        <div className={navClass("", nav.mobileFilter)}>
          <StudioSearchField
            hook="studio-mobile-navigation-filter"
            label="Filter destinations"
            placeholder="Filter destinations"
            value={props.filter}
            onChange={props.onFilterChange}
          />
        </div>
        {props.trailing}
      </header>
      {matching.length === 0 ? (
        <p className={navClass("", nav.mobileEmpty)}>
          No destination matches “{props.filter.trim()}”. Clear the filter to
          see every destination.
        </p>
      ) : null}
      {direct.length > 0 && (
        <section
          className={navClass(
            "studio-mobile-navigation-group",
            nav.mobileDirect,
          )}
        >
          {direct.map((entry) => option(entry, true))}
        </section>
      )}
      {collapsible.map((group) => (
        <MobileNavigationGroup
          id={props.groupId(group.area)}
          key={group.area}
          label={group.label}
          // A filter opens every group that still has something in it.
          open={query !== "" || props.isGroupOpen(group.area)}
          currentLabel={
            group.options.find((entry) => entry.value === props.activeValue)
              ?.label
          }
          onToggle={(open) => props.onToggleGroup(group.area, open)}
        >
          {group.options.map((entry) => option(entry))}
        </MobileNavigationGroup>
      ))}
    </>
  );
}

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
  const currentArea = props.groupings?.active
    ? "library"
    : studioArea(props.active, props.activeWorkspace ?? null);
  const destination = props.groupings?.active
    ? `${MOBILE_GROUPING_PREFIX}${props.groupings.active}`
    : (props.activeWorkspace ?? props.active);
  // Browsing does not navigate or discard drafts. A changed destination,
  // including Back/Forward, restores its owning area.
  const [browsingArea, setBrowsingArea] = useState<StudioArea | null>(null);
  const [lastDestination, setLastDestination] = useState(destination);
  if (destination !== lastDestination) {
    setLastDestination(destination);
    setBrowsingArea(null);
  }
  const activeArea = browsingArea ?? currentArea;
  const leafOpen =
    activeArea === "library" ||
    activeArea === "work" ||
    activeArea === "system";
  const leafId = useId();
  const selectArea = (area: StudioArea): void => {
    const destinationWorkspace = [
      overviewWorkspace,
      chatWorkspace,
      administrationWorkspace,
    ].find((workspace) => workspace && studioArea(null, workspace.id) === area);
    if (destinationWorkspace) {
      if (destinationWorkspace.id === props.activeWorkspace)
        setBrowsingArea(null);
      else props.onSelectWorkspace?.(destinationWorkspace.id);
    } else {
      setStudioNavigationCollapsed(false);
      setBrowsingArea(area);
    }
  };
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(
    currentArea ? { [currentArea]: true } : {},
  );
  const toggleGroup = (area: string, open: boolean): void => {
    setOpenGroups((previous) =>
      previous[area] === open ? previous : { ...previous, [area]: open },
    );
  };
  const mobileTypeOption = (info: EntityTypeInfo): MobileNavigationOption => ({
    value: `${MOBILE_TYPE_PREFIX}${info.entityType}`,
    label: navigationTypeLabel(info),
    ...(info.isSingleton ? {} : { tally: info.count }),
  });
  const workspaceBadge = (
    workspace: StudioWorkspaceInfo | undefined,
  ): number => (workspace ? (props.workspaceBadges?.[workspace.id] ?? 0) : 0);
  const mobileWorkspaceOption = (
    workspace: StudioWorkspaceInfo,
  ): MobileNavigationOption => {
    const attention = workspaceBadge(workspace);
    return {
      value: `${MOBILE_WORKSPACE_PREFIX}${workspace.id}`,
      label: workspace.label,
      accessibleLabel: workspace.label,
      ...(attention > 0 ? { attention } : {}),
    };
  };
  const mobileGroups = [
    ...(overviewWorkspace
      ? [
          {
            area: "overview",
            label: "Home",
            options: [mobileWorkspaceOption(overviewWorkspace)],
          },
        ]
      : []),
    ...(chatWorkspace
      ? [
          {
            area: "chat",
            label: "Chat",
            options: [mobileWorkspaceOption(chatWorkspace)],
          },
        ]
      : []),
    {
      area: "library",
      label: "Library",
      options: [
        ...primaryTypeGroups.flatMap((group) =>
          group.types.map(mobileTypeOption),
        ),
        ...(props.groupings?.items ?? []).map((grouping) => ({
          value: `${MOBILE_GROUPING_PREFIX}${grouping.key}`,
          label: grouping.label,
        })),
      ],
    },
    ...(operationWorkspaces.length > 0
      ? [
          {
            area: "work",
            label: "Work",
            options: operationWorkspaces.map(mobileWorkspaceOption),
          },
        ]
      : []),
    ...(administrationWorkspace
      ? [
          {
            area: "administration",
            label: "Admin",
            options: [
              {
                ...mobileWorkspaceOption(administrationWorkspace),
                label: "Admin",
              },
            ],
          },
        ]
      : []),
    {
      area: "system",
      label: "System",
      options: secondaryTypeGroups.flatMap((group) =>
        group.types.map(mobileTypeOption),
      ),
    },
  ];
  const activeMobileView = props.groupings?.active
    ? `${MOBILE_GROUPING_PREFIX}${props.groupings.active}`
    : props.active
      ? `${MOBILE_TYPE_PREFIX}${props.active}`
      : props.activeWorkspace
        ? `${MOBILE_WORKSPACE_PREFIX}${props.activeWorkspace}`
        : "";
  const [mobileFilter, setMobileFilter] = useState("");
  const [browseOpen, setBrowseOpen] = useState(false);
  const selectMobileView = (value: string): void => {
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
      badge: workspaceBadge(overviewWorkspace),
    },
    {
      id: "chat",
      index: "01",
      label: "Chat",
      available: chatWorkspace !== undefined,
      badge: workspaceBadge(chatWorkspace),
    },
    {
      id: "library",
      index: "02",
      label: "Library",
      available:
        primaryTypeGroups.length > 0 ||
        (props.groupings?.items.length ?? 0) > 0,
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
      badge: workspaceBadge(administrationWorkspace),
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
            <DialogPrimitive.Overlay
              className={navClass("", nav.sheetOverlay)}
            />
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
                className={navClass(
                  "studio-mobile-navigation-list",
                  nav.sheetList,
                )}
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
                {activeArea === "library" ? (
                  <>
                    {primaryTypeGroups.map(renderGroup)}
                    {(props.groupings?.items.length ?? 0) > 0 && (
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
                          Groupings
                        </div>
                        <ul className={navClass("", nav.list)}>
                          {props.groupings?.items.map((grouping) => (
                            <li key={grouping.key}>
                              <button
                                type="button"
                                className={navClass(
                                  grouping.key === props.groupings?.active
                                    ? "studio-leaf-link active"
                                    : "studio-leaf-link",
                                  nav.leafLink,
                                  grouping.key === props.groupings?.active &&
                                    nav.leafActive,
                                )}
                                aria-current={
                                  grouping.key === props.groupings?.active
                                    ? "page"
                                    : undefined
                                }
                                onClick={() =>
                                  props.groupings?.onSelect(grouping.key)
                                }
                              >
                                {grouping.label}
                              </button>
                            </li>
                          ))}
                        </ul>
                      </section>
                    )}
                  </>
                ) : null}
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
