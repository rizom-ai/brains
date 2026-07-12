import type { ConsoleSurface } from "./surfaces";

export interface ConsoleStripHtmlOptions {
  /** Console-strip doors, derived from the registered web routes. */
  surfaces: ConsoleSurface[];
  /** Sign-out link for the session chip (operator-only surfaces). */
  sessionHref: string;
}

/**
 * The console strip as an HTML string, for surfaces whose shell is a
 * server-rendered template hosting a React bundle (web-chat, the CMS
 * editor): the chrome paints before the bundle loads and its inputs are
 * server-side values. The dashboard renders the same markup natively in
 * Preact — keep the two in step.
 */
export function renderConsoleStripHtml({
  surfaces,
  sessionHref,
}: ConsoleStripHtmlOptions): string {
  const home =
    surfaces.find((surface) => surface.id === "dashboard")?.href ??
    surfaces.find((surface) => surface.isActive)?.href ??
    "/";
  const links = surfaces
    .map(
      (surface) =>
        `<a class="surface-nav-link${surface.isActive ? " is-active" : ""}" href="${surface.href}">${surface.label}</a>`,
    )
    .join("");
  return (
    `<header class="console-strip" aria-label="Operator surfaces">` +
    `<a class="console-mark" href="${home}" aria-label="Console home"><span class="pulse"></span><span>Brain <span class="console-mark-long">· <b>Console</b></span></span></a>` +
    `<nav class="surface-nav" aria-label="Console surfaces">${links}</nav>` +
    `<button class="command-chip" type="button" aria-label="Search or jump"><span class="command-chip-hint">Search or jump…</span><kbd>⌘K</kbd><span class="command-chip-icon" aria-hidden="true">⌕</span></button>` +
    `<button id="climateToggle" class="climate-chip" type="button" aria-label="Toggle climate">◐</button>` +
    `<a class="session-chip" href="${sessionHref}" aria-label="Operator · Sign out"><span>Operator</span><strong>Sign out</strong><span class="session-chip-avatar" aria-hidden="true">OP</span></a>` +
    `</header>`
  );
}
