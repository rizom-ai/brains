/** @jsxImportSource preact */
import type { ConsoleSurface } from "@brains/console-theme";
import type { JSX } from "preact";
import type { DashboardRenderInput } from "./types";

export function ConsoleStrip({
  dashboardPath,
  surfaces,
  operatorAccess,
}: {
  dashboardPath: string;
  surfaces: ConsoleSurface[];
  operatorAccess: DashboardRenderInput["operatorAccess"];
}): JSX.Element {
  const sessionHref = operatorAccess?.isOperator
    ? operatorAccess.logoutUrl
    : (operatorAccess?.loginUrl ?? "/login");
  const sessionLabel = operatorAccess?.isOperator ? "Operator" : "Visitor";
  const sessionAction = operatorAccess?.isOperator ? "Sign out" : "Sign in";

  return (
    <header class="console-strip" aria-label="Operator surfaces">
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
        class={
          operatorAccess?.isOperator
            ? "session-chip"
            : "session-chip is-visitor"
        }
        href={sessionHref}
        aria-label={`${sessionLabel} · ${sessionAction}`}
      >
        <span>{sessionLabel}</span>
        <strong>{sessionAction}</strong>
        <span class="session-chip-avatar" aria-hidden="true">
          {operatorAccess?.isOperator ? "OP" : "VI"}
        </span>
      </a>
    </header>
  );
}
