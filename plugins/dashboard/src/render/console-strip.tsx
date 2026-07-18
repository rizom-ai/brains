/** @jsxImportSource preact */
import type { ConsoleSurface } from "@brains/console-theme";
import type { JSX } from "preact";
import type { DashboardRenderInput } from "./types";

function roleLabel(role: "anchor" | "trusted" | "public"): string {
  return `${role.slice(0, 1).toUpperCase()}${role.slice(1)}`;
}

function initials(displayName: string): string {
  return displayName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.slice(0, 1).toUpperCase())
    .join("");
}

export function ConsoleStrip({
  dashboardPath,
  surfaces,
  authAccess,
}: {
  dashboardPath: string;
  surfaces: ConsoleSurface[];
  authAccess: DashboardRenderInput["authAccess"];
}): JSX.Element {
  const principal = authAccess?.principal;
  const sessionHref = principal
    ? authAccess.logoutUrl
    : (authAccess?.loginUrl ?? "/login");
  const sessionLabel = principal?.displayName ?? "Visitor";
  const sessionAction = principal ? "Sign out" : "Sign in";

  return (
    <header class="console-strip" aria-label="Console surfaces">
      <a class="console-mark" href={dashboardPath} aria-label="Dashboard home">
        <span class="pulse"></span>
        <span>
          Brain{" "}
          <span class="console-mark-long">
            · <b>Console</b>
          </span>
        </span>
      </a>
      <nav class="surface-nav" aria-label="Console surfaces">
        {surfaces.map((surface) => (
          <a
            key={surface.id}
            class={
              surface.isActive
                ? "surface-nav-link is-active"
                : "surface-nav-link"
            }
            href={surface.href}
          >
            {surface.label}
          </a>
        ))}
      </nav>
      <button class="command-chip" type="button" aria-label="Search or jump">
        <span class="command-chip-hint">Search or jump…</span>
        <kbd>⌘K</kbd>
        <span class="command-chip-icon" aria-hidden="true">
          ⌕
        </span>
      </button>
      <button
        id="climateToggle"
        class="climate-chip"
        type="button"
        aria-label="Toggle climate"
      >
        ◐
      </button>
      <a
        class={principal ? "session-chip" : "session-chip is-visitor"}
        href={sessionHref}
        aria-label={`${sessionLabel} · ${principal ? roleLabel(principal.role) : sessionAction} · ${sessionAction}`}
      >
        <span>
          {sessionLabel}
          {principal ? ` · ${roleLabel(principal.role)}` : ""}
        </span>
        <strong>{sessionAction}</strong>
        <span class="session-chip-avatar" aria-hidden="true">
          {principal ? initials(principal.displayName) : "VI"}
        </span>
      </a>
    </header>
  );
}
