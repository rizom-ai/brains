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
import { studioArea, TypeSwitcher } from "./entity-fields";
import { getStudioRouterBasePath } from "./studio-router";
import {
  navigationClassName as navClass,
  navigationStyles as nav,
} from "./studio-navigation.styles";

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

  const area = props.navigation
    ? studioArea(
        props.navigation.activeEntityType,
        props.navigation.activeWorkspaceId,
      )
    : null;
  const location =
    area && area !== "overview"
      ? `${area.charAt(0).toUpperCase()}${area.slice(1)} · ${props.contextLabel}`
      : props.contextLabel;

  return (
    <header
      className={navClass("studio-chrome", nav.chromeHeader)}
      aria-label="Studio"
    >
      <a
        className={navClass("studio-chrome-brand", nav.chromeBrand)}
        href={studioPath}
      >
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
        <div
          className={navClass(
            "studio-chrome-mobile-navigation",
            nav.mobileHost,
          )}
        >
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

      <div className={navClass("studio-chrome-location", nav.chromeLocation)}>
        <span className={navClass("", nav.locationLabel)}>Workspace</span>
        {props.onContextClick ? (
          <button
            className={navClass("", nav.locationText)}
            type="button"
            onClick={props.onContextClick}
            aria-label={`Back to ${props.contextLabel}`}
          >
            {location}
          </button>
        ) : (
          <strong className={navClass("", nav.locationText)}>{location}</strong>
        )}
      </div>

      <div className="studio-chrome-tools">
        <button
          className={navClass(
            "command-chip studio-chrome-command",
            nav.chromeUtility,
          )}
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
          className={navClass(
            "climate-chip studio-chrome-climate",
            nav.chromeUtility,
          )}
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
