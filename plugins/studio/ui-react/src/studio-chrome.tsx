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
import { chromeStyles as chrome } from "./studio-chrome.styles";
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
  const accountCurrent =
    props.navigation?.activeWorkspaceId === STUDIO_ACCOUNT_WORKSPACE_ID;
  const location =
    area && ["library", "work", "system"].includes(area)
      ? `${area.charAt(0).toUpperCase()}${area.slice(1)} · ${props.contextLabel}`
      : props.contextLabel;

  return (
    <header
      className={navClass("studio-chrome", chrome.header)}
      aria-label="Studio"
    >
      <a
        className={navClass("studio-chrome-brand", chrome.brand)}
        href={studioPath}
      >
        <span
          className={navClass("studio-chrome-mark", chrome.mark)}
          aria-hidden="true"
        >
          {brandName.slice(0, 1).toUpperCase()}
        </span>
        <span className="studio-chrome-brain">{brandName}</span>
        <span
          className={navClass("studio-chrome-slash", chrome.slash)}
          aria-hidden="true"
        >
          /
        </span>
        <strong className={navClass("", chrome.studio)}>Studio</strong>
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

      <div className={navClass("studio-chrome-location", chrome.location)}>
        {props.onContextClick ? (
          <button
            className={navClass("", chrome.locationText)}
            type="button"
            onClick={props.onContextClick}
            aria-label={`Back to ${props.contextLabel}`}
          >
            {location}
          </button>
        ) : (
          <strong className={navClass("", chrome.locationText)}>
            {location}
          </strong>
        )}
      </div>

      <div className={navClass("studio-chrome-tools", chrome.tools)}>
        <button
          className={navClass(
            "command-chip studio-chrome-command",
            chrome.command,
          )}
          type="button"
          aria-label="Search or run a command"
        >
          <span className="command-chip-hint">Search or run a command…</span>
          <kbd className={navClass("", chrome.key)}>⌘K</kbd>
        </button>
        <button
          id="climateToggle"
          className={navClass(
            "climate-chip studio-chrome-climate",
            chrome.climate,
          )}
          type="button"
          aria-label="Toggle climate"
        >
          ◐
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className={navClass("studio-chrome-identity", chrome.identity)}
              type="button"
              aria-label={`${displayName} account menu`}
              aria-current={accountCurrent ? "page" : undefined}
            >
              <span
                className={navClass(
                  "",
                  chrome.identityBadge,
                  accountCurrent && chrome.identityCurrent,
                )}
              >
                {initials(displayName)}
              </span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className={navClass("studio-chrome-identity-menu", chrome.menu)}
            align="end"
            sideOffset={8}
          >
            <DropdownMenuLabel className="studio-chrome-identity-label">
              <strong className={navClass("", chrome.name)}>
                {displayName}
              </strong>
              <span className={navClass("", chrome.role)}>{role}</span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={() => {
                if (props.navigation) {
                  if (!accountCurrent)
                    props.navigation.selectWorkspace(
                      STUDIO_ACCOUNT_WORKSPACE_ID,
                    );
                } else navigate(accountHref);
              }}
            >
              Account
              <span className={navClass("", chrome.arrow)} aria-hidden="true">
                →
              </span>
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => navigate(dashboardHref)}>
              View public dashboard
              <span className={navClass("", chrome.arrow)} aria-hidden="true">
                ↗
              </span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              onSelect={() => navigate(sessionHref)}
            >
              Sign out
              <span className={navClass("", chrome.arrow)} aria-hidden="true">
                ⇥
              </span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
