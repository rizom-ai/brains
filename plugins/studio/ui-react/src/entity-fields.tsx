/** @jsxImportSource react */
import {
  Button,
  Dialog,
  DialogClose,
  DialogPortal,
  DialogTrigger,
  Input,
  NativeSelect,
  Switch,
  Textarea,
} from "@brains/app-ui-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useId, useState, type ReactElement, type ReactNode } from "react";
import {
  useStudioNavigationCollapsed,
  setStudioNavigationCollapsed,
} from "./studio-navigation-state";
import { Dialog as DialogPrimitive } from "radix-ui";
import type {
  StudioWorkspaceInfo,
  EntityTypeInfo,
  FieldDescriptor,
} from "./api";
import { uploadImage, type UploadImageResult } from "./mutations";
import { invalidateAfterUpload } from "./queries";
import { useStudioApi } from "./studio-api-context";
import {
  navigationClassName as navClass,
  navigationStyles as nav,
} from "./studio-navigation.styles";
import { datetimeLocalValue, errorMessage, singularLabel } from "./ui-utils";

function navigationTypeLabel(info: EntityTypeInfo): string {
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
const SYSTEM_ENTITY_TYPES = new Set([
  "agent",
  "agents",
  "anchor-profile",
  "brain-character",
  "playbook",
  "playbooks",
  "prompt",
  "prompts",
  "skill",
  "skills",
  "style-guide",
  "swot",
  "swots",
]);

function studioTypeGroup(
  entityType: string,
): "Content" | "Collections" | "Site" | "System" {
  if (SITE_ENTITY_TYPES.has(entityType)) return "Site";
  if (SYSTEM_ENTITY_TYPES.has(entityType)) return "System";
  if (COLLECTION_ENTITY_TYPES.has(entityType)) return "Collections";
  return "Content";
}

/**
 * Whether a type's schema models a publication lifecycle. Rows only wear a
 * draft/published chip when the distinction exists — system types like
 * prompts otherwise all read "draft".
 */
export function typeHasPublicationField(fields: FieldDescriptor[]): boolean {
  return fields.some(
    (field) => field.name === "status" || field.name === "published",
  );
}

export function isFieldVisible(
  field: FieldDescriptor,
  values: Record<string, unknown>,
): boolean {
  if (!field.condition) return true;
  const expected = field.condition.value;
  const actual = values[field.condition.field];
  return Array.isArray(expected)
    ? expected.some((value) => value === actual)
    : expected === actual;
}

export function visibleFieldValues(
  fields: FieldDescriptor[],
  values: Record<string, unknown>,
): Record<string, unknown> {
  const hiddenFields = new Set(
    fields
      .filter((field) => !isFieldVisible(field, values))
      .map((field) => field.name),
  );
  return Object.fromEntries(
    Object.entries(values).filter(([name]) => !hiddenFields.has(name)),
  );
}

type StudioArea = "overview" | "library" | "work" | "system";

export function studioArea(
  entityType: string | null,
  workspaceId: string | null,
): StudioArea {
  if (workspaceId === "studio:overview") return "overview";
  if (workspaceId === "studio:account") return "system";
  if (workspaceId) return "work";
  const group = entityType ? studioTypeGroup(entityType) : null;
  return group === "Site" || group === "System" ? "system" : "library";
}

interface MobileNavigationOption {
  value: string;
  label: string;
  metadata: string;
}

const MOBILE_TYPE_PREFIX = "type:";
const MOBILE_WORKSPACE_PREFIX = "workspace:";

export function studioMobileSelection(
  value: string,
): { kind: "type" | "workspace"; id: string } | null {
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
  home: boolean;
  open: boolean;
  currentLabel?: string | undefined;
  onToggle: (open: boolean) => void;
  children: ReactNode;
}): ReactElement {
  if (props.home)
    return (
      <section
        id={props.id}
        className={navClass("studio-mobile-navigation-group", nav.mobileGroup)}
      >
        <h3 className={navClass("", nav.mobileLabel)}>{props.label}</h3>
        {props.children}
      </section>
    );
  return (
    <details
      id={props.id}
      className={navClass("studio-mobile-navigation-group", nav.mobileGroup)}
      open={props.open}
      onToggle={(event) => props.onToggle(event.currentTarget.open)}
    >
      <summary className={navClass("", nav.mobileSummary)}>
        {props.label}
        {!props.open && props.currentLabel ? (
          <span className={navClass("", nav.mobileCurrent)}>
            {props.currentLabel}
          </span>
        ) : null}
        <span aria-hidden="true" className={navClass("", nav.mobileDisclosure)}>
          {props.open ? "−" : "+"}
        </span>
      </summary>
      {props.children}
    </details>
  );
}

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
  const accountWorkspace = props.workspaces?.find(
    (workspace) => workspace.id === "studio:account",
  );
  const operationWorkspaces =
    props.workspaces?.filter(
      (workspace) =>
        workspace.id !== "studio:overview" && workspace.id !== "studio:account",
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
    {
      label: "Identity",
      types: systemTypes(["anchor-profile", "brain-character", "style-guide"]),
    },
    {
      label: "Intelligence",
      types: systemTypes([
        "prompt",
        "prompts",
        "skill",
        "skills",
        "playbook",
        "playbooks",
        "swot",
        "swots",
      ]),
    },
    {
      label: "Network",
      types: systemTypes(["agent", "agents"]),
    },
    ...groups.filter((group) => group.label === "Site"),
  ].filter((group) => group.types.length > 0);
  const currentArea = studioArea(props.active, props.activeWorkspace ?? null);
  const destination = props.activeWorkspace ?? props.active;
  // Browsing does not navigate or discard drafts. A changed destination,
  // including Back/Forward, restores its owning area.
  const [browsingArea, setBrowsingArea] = useState<StudioArea | null>(null);
  const [lastDestination, setLastDestination] = useState(destination);
  if (destination !== lastDestination) {
    setLastDestination(destination);
    setBrowsingArea(null);
  }
  const activeArea = browsingArea ?? currentArea;
  const leafId = useId();
  const selectArea = (area: StudioArea): void => {
    setStudioNavigationCollapsed(false);
    if (area === "overview" && overviewWorkspace) {
      props.onSelectWorkspace?.(overviewWorkspace.id);
      setBrowsingArea(null);
    } else {
      setBrowsingArea(area);
    }
  };
  const [mobileArea, setMobileArea] = useState(currentArea);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({
    [currentArea]: true,
  });
  const toggleGroup = (area: string, open: boolean): void => {
    setOpenGroups((previous) =>
      previous[area] === open ? previous : { ...previous, [area]: open },
    );
  };
  const mobileTypeOption = (info: EntityTypeInfo): MobileNavigationOption => ({
    value: `${MOBILE_TYPE_PREFIX}${info.entityType}`,
    label: navigationTypeLabel(info),
    metadata: info.isSingleton ? "solo" : String(info.count),
  });
  const mobileWorkspaceOption = (
    workspace: StudioWorkspaceInfo,
  ): MobileNavigationOption => ({
    value: `${MOBILE_WORKSPACE_PREFIX}${workspace.id}`,
    label: workspace.label,
    metadata:
      (props.workspaceBadges?.[workspace.id] ?? 0) > 0
        ? String(props.workspaceBadges?.[workspace.id])
        : "",
  });
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
    {
      area: "library",
      label: "Library",
      options: primaryTypeGroups.flatMap((group) =>
        group.types.map(mobileTypeOption),
      ),
    },
    ...(operationWorkspaces.length > 0
      ? [
          {
            area: "work",
            label: "Workflows",
            options: operationWorkspaces.map(mobileWorkspaceOption),
          },
        ]
      : []),
    {
      area: "system",
      label: "System",
      options: [
        ...secondaryTypeGroups.flatMap((group) =>
          group.types.map(mobileTypeOption),
        ),
        ...(accountWorkspace ? [mobileWorkspaceOption(accountWorkspace)] : []),
      ],
    },
  ];
  const activeMobileView = props.active
    ? `${MOBILE_TYPE_PREFIX}${props.active}`
    : props.activeWorkspace
      ? `${MOBILE_WORKSPACE_PREFIX}${props.activeWorkspace}`
      : "";
  const selectMobileView = (value: string): void => {
    const selection = studioMobileSelection(value);
    if (selection?.kind === "type") {
      props.onSelect(selection.id);
      return;
    }
    if (selection?.kind === "workspace") {
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
      <div className={navClass("studio-leaf-label", nav.leafLabel)}>
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
              {info.isSingleton ? (
                <span
                  className={navClass(
                    "singleton-mark",
                    nav.count,
                    nav.singleton,
                  )}
                >
                  solo
                </span>
              ) : (
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
  }[] = [
    {
      id: "overview",
      index: "00",
      label: "Overview",
      available: overviewWorkspace !== undefined,
    },
    {
      id: "library",
      index: "01",
      label: "Library",
      available: primaryTypeGroups.length > 0,
    },
    {
      id: "work",
      index: "02",
      label: "Work",
      available: operationWorkspaces.length > 0,
    },
    {
      id: "system",
      index: "03",
      label: "System",
      available:
        secondaryTypeGroups.length > 0 || accountWorkspace !== undefined,
    },
  ];
  const areaCopy: Record<StudioArea, { kicker: string; description: string }> =
    {
      overview: {
        kicker: "00 / operator home",
        description: "Attention, activity and operational health.",
      },
      library: {
        kicker: "01 / durable content",
        description: "Authored material held by this brain.",
      },
      work: {
        kicker: "02 / workflows",
        description: "Conversations, publishing and operations.",
      },
      system: {
        kicker: "03 / machinery",
        description: "Identity, behaviour, tools and network actors.",
      },
    };

  return (
    <>
      {props.renderMode !== "desktop" ? (
        <Dialog
          onOpenChange={(open) => {
            if (open) {
              setMobileArea(currentArea);
              toggleGroup(currentArea, true);
            }
          }}
        >
          <DialogTrigger asChild>
            <button
              type="button"
              className={navClass("studio-mobile-switcher", nav.browse)}
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
            >
              <div
                className={navClass(
                  "studio-mobile-navigation-list",
                  nav.sheetList,
                )}
              >
                <header className={navClass("", nav.sheetHead)}>
                  <DialogPrimitive.Title
                    className={navClass("", nav.sheetTitle)}
                  >
                    Browse Studio
                  </DialogPrimitive.Title>
                  <DialogClose className={navClass("", nav.sheetClose)}>
                    Close
                  </DialogClose>
                </header>
                {mobileGroups
                  .filter((group) => group.options.length > 0)
                  .map((group) => (
                    <MobileNavigationGroup
                      id={`${leafId}-${group.area}`}
                      key={group.area}
                      label={group.label}
                      home={group.area === "overview"}
                      open={openGroups[group.area] === true}
                      currentLabel={
                        group.options.find(
                          (option) => option.value === activeMobileView,
                        )?.label
                      }
                      onToggle={(open) => toggleGroup(group.area, open)}
                    >
                      {group.options.map((option) => (
                        <DialogClose asChild key={option.value}>
                          <button
                            className={navClass(
                              option.value === activeMobileView
                                ? "studio-mobile-navigation-link active"
                                : "studio-mobile-navigation-link",
                              nav.mobileLink,
                              option.value === activeMobileView &&
                                nav.mobileActive,
                            )}
                            type="button"
                            aria-current={
                              option.value === activeMobileView
                                ? "page"
                                : undefined
                            }
                            onClick={() => selectMobileView(option.value)}
                          >
                            {option.label}
                            <span className={navClass("", nav.count)}>
                              {option.metadata}
                            </span>
                          </button>
                        </DialogClose>
                      ))}
                    </MobileNavigationGroup>
                  ))}
              </div>
              <nav
                className={navClass(
                  "studio-mobile-navigation-dock",
                  nav.mobileDock,
                )}
                aria-label="Browse areas"
              >
                {areas.map((area) => (
                  <button
                    type="button"
                    key={area.id}
                    disabled={!area.available}
                    className={navClass(
                      "studio-mobile-area-link",
                      nav.dockLink,
                      mobileArea === area.id && nav.dockActive,
                    )}
                    aria-pressed={mobileArea === area.id}
                    onClick={() => {
                      setMobileArea(area.id);
                      toggleGroup(area.id, true);
                      requestAnimationFrame(() =>
                        document
                          .getElementById(`${leafId}-${area.id}`)
                          ?.scrollIntoView({ block: "start" }),
                      );
                    }}
                  >
                    {area.label}
                  </button>
                ))}
              </nav>
            </DialogPrimitive.Content>
          </DialogPortal>
        </Dialog>
      ) : null}
      {props.renderMode !== "mobile" ? (
        <nav
          className={navClass(
            "types studio-navigation",
            nav.navigation,
            collapsed && nav.navigationCollapsed,
          )}
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
                aria-controls={leafId}
                onClick={() => setStudioNavigationCollapsed(!collapsed)}
              >
                {collapsed ? "⇥" : "⇤"}
              </button>
            </div>
            {areas.map((area) => (
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
                aria-label={area.label}
                title={collapsed ? area.label : undefined}
                aria-pressed={area.id === activeArea}
                aria-controls={area.id !== "overview" ? leafId : undefined}
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
                  {area.index}
                </b>
                <span className={navClass("", collapsed && nav.collapsedLabel)}>
                  {area.label}
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
              <span className={navClass("", nav.leafKicker)}>
                {areaCopy[activeArea].kicker}
              </span>
              <h2 className={navClass("", nav.leafTitle)}>
                {areas.find((area) => area.id === activeArea)?.label}
              </h2>
              <p className={navClass("", nav.leafDescription)}>
                {areaCopy[activeArea].description}
              </p>
            </header>
            <div className={navClass("studio-leaf-scroll", nav.leafScroll)}>
              {activeArea === "overview" && overviewWorkspace ? (
                <section
                  className={navClass("studio-leaf-group", nav.leafGroup)}
                >
                  <ul className={navClass("", nav.list)}>
                    {renderWorkspaceLink(overviewWorkspace)}
                  </ul>
                </section>
              ) : null}
              {activeArea === "library"
                ? primaryTypeGroups.map(renderGroup)
                : null}
              {activeArea === "work" && operationWorkspaces.length > 0 ? (
                <section
                  className={navClass("studio-leaf-group", nav.leafGroup)}
                >
                  <div className={navClass("studio-leaf-label", nav.leafLabel)}>
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
              {activeArea === "system" && accountWorkspace ? (
                <section
                  className={navClass("studio-leaf-group", nav.leafGroup)}
                >
                  <div className={navClass("studio-leaf-label", nav.leafLabel)}>
                    Access
                  </div>
                  <ul className={navClass("", nav.list)}>
                    {renderWorkspaceLink(accountWorkspace)}
                  </ul>
                </section>
              ) : null}
            </div>
          </section>
        </nav>
      ) : null}
    </>
  );
}

/**
 * Image-reference widget: uploads go to the configured Studio upload API, which promotes the
 * bytes into an `image` entity through the owning plugin's pipeline; the
 * field stores the resulting entity id.
 */
function ImageField(props: {
  descriptor: FieldDescriptor;
  value: unknown;
  onChange: (raw: string) => void;
}): ReactElement {
  const { descriptor, value, onChange } = props;
  const queryClient = useQueryClient();
  const api = useStudioApi();
  const uploadMutation = useMutation({
    mutationFn: (file: File): Promise<UploadImageResult> =>
      uploadImage(api, file),
  });
  const current = typeof value === "string" && value.length > 0 ? value : null;

  return (
    <div className="field field-image">
      <span className="field-label">
        {descriptor.label}
        <em className="kind">image entity</em>
      </span>
      {current && (
        <p className="image-ref">
          <code>{current}</code>
          <Button
            type="button"
            variant="link"
            size="xs"
            onClick={() => onChange("")}
          >
            Clear
          </Button>
        </p>
      )}
      <label className="upload-zone">
        <span className="upload-glyph" aria-hidden="true">
          ↑
        </span>
        <strong>Choose an image</strong>
        <small>PNG, JPEG, GIF, WebP, AVIF, or SVG</small>
        <input
          type="file"
          accept="image/*"
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            if (!file) return;
            uploadMutation.mutate(file, {
              onSuccess: (result) => {
                onChange(result.entityId);
                void invalidateAfterUpload(queryClient);
              },
            });
          }}
        />
      </label>
      {uploadMutation.isPending && <p className="status">Uploading…</p>}
      {uploadMutation.error && (
        <p className="status status-error">
          {errorMessage(uploadMutation.error)}
        </p>
      )}
    </div>
  );
}

function StringListField(props: {
  descriptor: FieldDescriptor;
  value: unknown;
  onChange: (raw: string[]) => void;
}): ReactElement {
  const [pending, setPending] = useState("");
  const values = Array.isArray(props.value)
    ? props.value.filter((item): item is string => typeof item === "string")
    : [];
  const add = (): void => {
    const next = pending.trim();
    if (next && !values.includes(next)) props.onChange([...values, next]);
    setPending("");
  };

  return (
    <div className="field field-tags">
      <span className="field-label">
        {props.descriptor.label}
        <em className="kind">tags</em>
      </span>
      <div className="tags">
        {values.map((value) => (
          <span className="tag" key={value}>
            {value}
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label={`Remove ${value}`}
              onClick={() =>
                props.onChange(values.filter((item) => item !== value))
              }
            >
              ×
            </Button>
          </span>
        ))}
        <span className="tag tag-add">
          <Input
            type="text"
            value={pending}
            aria-label={`Add ${props.descriptor.label.toLowerCase()} tag`}
            placeholder="Add tag"
            onChange={(event) => setPending(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === ",") {
                event.preventDefault();
                add();
              }
            }}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label="Add tag"
            onClick={add}
          >
            +
          </Button>
        </span>
      </div>
    </div>
  );
}

export type FieldAssistVariant = "summarise" | "tag-suggest";

export type FieldAssistState =
  | { kind: "idle" }
  | { kind: "loading"; field: string; variant: FieldAssistVariant }
  | {
      kind: "suggested";
      field: string;
      variant: FieldAssistVariant;
      suggestion: string | string[];
    }
  | { kind: "error"; field: string; message: string };

export function fieldAssistVariant(
  descriptor: FieldDescriptor,
): FieldAssistVariant | null {
  if (descriptor.widget === "text") return "summarise";
  if (descriptor.widget === "list" && descriptor.field?.widget === "string") {
    return "tag-suggest";
  }
  return null;
}

export function applyFieldAssistSuggestion(
  draft: Record<string, unknown>,
  field: string,
  suggestion: string | string[],
): Record<string, unknown> {
  return { ...draft, [field]: suggestion };
}

export function FieldAssistControls(props: {
  descriptor: FieldDescriptor;
  state: FieldAssistState;
  onRun: (variant: FieldAssistVariant, field: string) => void;
  onApply: (field: string, suggestion: string | string[]) => void;
  onDiscard: () => void;
}): ReactElement | null {
  const { descriptor, state, onRun, onApply, onDiscard } = props;
  const variant = fieldAssistVariant(descriptor);
  if (!variant) return null;
  const active = "field" in state && state.field === descriptor.name;

  if (active && state.kind === "suggested") {
    return (
      <div className="field-assist-suggestion">
        {Array.isArray(state.suggestion) ? (
          <span className="field-assist-tags">
            {state.suggestion.map((tag) => (
              <code key={tag}>{tag}</code>
            ))}
          </span>
        ) : (
          <span className="field-assist-copy">{state.suggestion}</span>
        )}
        <Button
          type="button"
          size="xs"
          onClick={() => onApply(state.field, state.suggestion)}
        >
          Apply
        </Button>
        <Button type="button" variant="ghost" size="xs" onClick={onDiscard}>
          Discard
        </Button>
      </div>
    );
  }

  return (
    <div className="field-assist-controls">
      <Button
        type="button"
        variant="outline"
        size="xs"
        disabled={active && state.kind === "loading"}
        onClick={() => onRun(variant, descriptor.name)}
      >
        {active && state.kind === "loading"
          ? "Thinking…"
          : variant === "summarise"
            ? "Summarise body"
            : `Suggest ${descriptor.label.toLowerCase()}`}
      </Button>
      {active && state.kind === "error" && (
        <span className="status status-error">{state.message}</span>
      )}
    </div>
  );
}

export function Field(props: {
  descriptor: FieldDescriptor;
  value: unknown;
  onChange: (raw: unknown) => void;
}): ReactElement {
  const { descriptor, value, onChange } = props;
  const required = descriptor.required !== false;
  const text =
    typeof value === "string" || typeof value === "number" ? String(value) : "";
  const label = (
    <span className="field-label">
      {descriptor.label}
      {required ? (
        <em className="req">required</em>
      ) : (
        <em className="kind">{descriptor.widget}</em>
      )}
    </span>
  );

  if (descriptor.widget === "image") {
    return (
      <ImageField descriptor={descriptor} value={value} onChange={onChange} />
    );
  }

  if (descriptor.widget === "boolean") {
    return (
      <label className="field field-inline">
        <span className="field-label">{descriptor.label}</span>
        <Switch
          checked={value === true}
          onCheckedChange={(checked) => onChange(checked)}
        />
      </label>
    );
  }

  if (descriptor.widget === "select") {
    return (
      <label className="field">
        {label}
        <NativeSelect
          value={text}
          required={required}
          onChange={(event) => onChange(event.currentTarget.value)}
        >
          <option value="">—</option>
          {(descriptor.options ?? []).map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </NativeSelect>
      </label>
    );
  }

  if (descriptor.widget === "text") {
    return (
      <label className="field">
        {label}
        <Textarea
          value={text}
          required={required}
          rows={4}
          onChange={(event) => onChange(event.currentTarget.value)}
        />
      </label>
    );
  }

  if (descriptor.widget === "list" && descriptor.field?.widget === "string") {
    return (
      <StringListField
        descriptor={descriptor}
        value={value}
        onChange={onChange}
      />
    );
  }

  if (descriptor.widget === "list" || descriptor.widget === "object") {
    // Nested structured widgets remain read-only; the value round-trips
    // untouched because saves only send changed draft keys.
    return (
      <label className="field">
        <span className="field-label">
          {descriptor.label}
          <em className="kind">read-only</em>
        </span>
        <Textarea
          value={JSON.stringify(value ?? null, null, 2)}
          disabled
          rows={4}
        />
      </label>
    );
  }

  return (
    <label className="field">
      {label}
      <Input
        type={
          descriptor.widget === "number"
            ? "number"
            : descriptor.widget === "datetime"
              ? "datetime-local"
              : "text"
        }
        value={
          descriptor.widget === "datetime" ? datetimeLocalValue(text) : text
        }
        required={required}
        onChange={(event) =>
          onChange(
            descriptor.widget === "datetime" && event.currentTarget.value
              ? new Date(event.currentTarget.value).toISOString()
              : event.currentTarget.value,
          )
        }
      />
    </label>
  );
}
