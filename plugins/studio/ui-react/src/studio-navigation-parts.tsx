/** @jsxImportSource react */
import type { ReactElement, ReactNode } from "react";
import type { EntityTypeInfo, StudioWorkspaceInfo } from "./api";
import {
  navigationClassName as navClass,
  navigationStyles as nav,
} from "./studio-navigation.styles";
import { typographyStyles } from "./studio-typography.styles";
import { singularLabel } from "./ui-utils";
import { StudioSearchField } from "./studio-search-field";

const DIRECT_MOBILE_AREAS = ["overview", "chat", "administration"];

/** The unread or attention count a workspace is showing, if any. */
export function workspaceBadge(
  workspace: StudioWorkspaceInfo | undefined,
  badges: Record<string, number> | undefined,
): number {
  return workspace ? (badges?.[workspace.id] ?? 0) : 0;
}

export function navigationTypeLabel(info: EntityTypeInfo): string {
  return info.isSingleton && info.entityType !== "settings"
    ? singularLabel(info.label)
    : info.label;
}

export interface MobileNavigationOption {
  value: string;
  label: string;
  /** How many items the destination holds. */
  tally?: number;
  /** How many of them need the operator. */
  attention?: number;
  accessibleLabel?: string;
}

export interface MobileNavigationGroupModel {
  area: string;
  label: string;
  options: MobileNavigationOption[];
}

export const MOBILE_TYPE_PREFIX: string = "type:";

export const MOBILE_WORKSPACE_PREFIX: string = "workspace:";

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

export function MobileNavigationGroup(props: {
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
