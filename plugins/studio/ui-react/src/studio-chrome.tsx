/** @jsxImportSource react */
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@brains/app-ui-react";
import type { ReactElement } from "react";
import { STUDIO_ACCOUNT_WORKSPACE_ID } from "../../src/account-workspace";
import { studioWorkspacePath } from "../../src/studio-paths";
import type { EntityTypeInfo, StudioWorkspaceInfo } from "./api";
import { TypeSwitcher } from "./entity-fields";
import { getStudioRouterBasePath } from "./studio-router";

function rootAttribute(name: string, fallback: string): string {
  if (typeof document === "undefined") return fallback;
  return (
    document.querySelector("[data-studio-root]")?.getAttribute(name) ?? fallback
  );
}

function initials(displayName: string): string {
  return displayName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.slice(0, 1).toUpperCase())
    .join("");
}

function navigate(href: string): void {
  window.location.assign(href);
}

export interface StudioChromeNavigation {
  types: EntityTypeInfo[];
  workspaces: StudioWorkspaceInfo[];
  activeEntityType: string | null;
  activeWorkspaceId: string | null;
  workspaceBadges: Record<string, number>;
  selectEntityType: (entityType: string) => void;
  selectWorkspace: (workspaceId: string) => void;
}

export function StudioChrome(props: {
  contextLabel: string;
  contextBadge?: number | undefined;
  onContextClick?: (() => void) | undefined;
  navigation?: StudioChromeNavigation | undefined;
}): ReactElement {
  const studioPath = getStudioRouterBasePath();
  const brandName = rootAttribute("data-studio-brand-name", "Brain");
  const displayName = rootAttribute(
    "data-studio-principal-name",
    "Your account",
  );
  const role = rootAttribute("data-studio-principal-role", "trusted");
  const sessionHref = rootAttribute(
    "data-studio-session-href",
    `/logout?return_to=${encodeURIComponent(studioPath)}`,
  );
  const dashboardHref = rootAttribute(
    "data-studio-dashboard-href",
    "/dashboard",
  );
  const accountHref = studioWorkspacePath(
    studioPath,
    STUDIO_ACCOUNT_WORKSPACE_ID,
  );

  return (
    <header className="studio-chrome" aria-label="Studio">
      <a className="studio-chrome-brand" href={studioPath}>
        <span className="studio-chrome-mark" aria-hidden="true">
          {brandName.slice(0, 1).toUpperCase()}
        </span>
        <span className="studio-chrome-brain">{brandName}</span>
        <span className="studio-chrome-slash" aria-hidden="true">
          /
        </span>
        <strong>Studio</strong>
      </a>

      {props.navigation ? (
        <div className="studio-chrome-mobile-navigation">
          <TypeSwitcher
            renderMode="mobile"
            types={props.navigation.types}
            active={props.navigation.activeEntityType}
            onSelect={props.navigation.selectEntityType}
            workspaces={props.navigation.workspaces}
            activeWorkspace={props.navigation.activeWorkspaceId}
            workspaceBadges={props.navigation.workspaceBadges}
            onSelectWorkspace={props.navigation.selectWorkspace}
          />
        </div>
      ) : null}

      <div className="studio-chrome-location">
        <span>Workspace</span>
        {props.onContextClick ? (
          <button type="button" onClick={props.onContextClick}>
            ← {props.contextLabel}
          </button>
        ) : (
          <strong>{props.contextLabel}</strong>
        )}
        {props.contextBadge !== undefined && props.contextBadge > 0 ? (
          <b>{props.contextBadge}</b>
        ) : null}
      </div>

      <div className="studio-chrome-tools">
        <button
          className="command-chip studio-chrome-command"
          type="button"
          aria-label="Search or run a command"
        >
          <span className="command-chip-hint">Search or run a command…</span>
          <kbd>⌘K</kbd>
          <span className="command-chip-icon" aria-hidden="true">
            ⌕
          </span>
        </button>
        <button
          id="climateToggle"
          className="climate-chip studio-chrome-climate"
          type="button"
          aria-label="Toggle climate"
        >
          ◐
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="studio-chrome-identity"
              type="button"
              aria-label={`${displayName} account menu`}
            >
              {initials(displayName)}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="studio-chrome-identity-menu"
            align="end"
            sideOffset={8}
          >
            <DropdownMenuLabel className="studio-chrome-identity-label">
              <strong>{displayName}</strong>
              <span>{role}</span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => navigate(accountHref)}>
              Account
              <span aria-hidden="true">→</span>
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => navigate(dashboardHref)}>
              View public dashboard
              <span aria-hidden="true">↗</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              onSelect={() => navigate(sessionHref)}
            >
              Sign out
              <span aria-hidden="true">⇥</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
