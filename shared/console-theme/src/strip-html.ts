import type { ConsoleSurface } from "@brains/contracts";

export interface ConsoleStripPrincipal {
  displayName: string;
  role: "admin" | "trusted" | "public";
}

/**
 * Who the session chip represents. Authenticated surfaces link to sign-out
 * and show the principal when the caller can supply one (falling back to
 * role-neutral copy); public surfaces show the visitor chip linking to login.
 */
export type ConsoleStripSession =
  | {
      kind: "authenticated";
      sessionHref: string;
      principal?: ConsoleStripPrincipal | undefined;
    }
  | { kind: "visitor"; loginHref: string };

export interface ConsoleStripHtmlOptions {
  /** Console-strip doors, derived from the registered web routes. */
  surfaces: ConsoleSurface[];
  /** Session-chip state for the requesting user. */
  session: ConsoleStripSession;
  /** Console-mark target; defaults to the dashboard surface, else the active one. */
  homeHref?: string | undefined;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function roleLabel(role: ConsoleStripPrincipal["role"]): string {
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

function renderSessionChip(session: ConsoleStripSession): string {
  if (session.kind === "visitor") {
    return (
      `<a class="session-chip is-visitor" href="${escapeHtml(session.loginHref)}" aria-label="Visitor · Sign in">` +
      `<span>Visitor</span><strong>Sign in</strong>` +
      `<span class="session-chip-avatar" aria-hidden="true">VI</span></a>`
    );
  }

  const href = escapeHtml(session.sessionHref);
  if (!session.principal) {
    return (
      `<a class="session-chip" href="${href}" aria-label="Authenticated · Sign out">` +
      `<span>Authenticated</span><strong>Sign out</strong>` +
      `<span class="session-chip-avatar" aria-hidden="true">AU</span></a>`
    );
  }

  const label = `${session.principal.displayName} · ${roleLabel(session.principal.role)}`;
  return (
    `<a class="session-chip" href="${href}" aria-label="${escapeHtml(label)} · Sign out">` +
    `<span>${escapeHtml(label)}</span><strong>Sign out</strong>` +
    `<span class="session-chip-avatar" aria-hidden="true">${escapeHtml(initials(session.principal.displayName))}</span></a>`
  );
}

/**
 * The console strip's inner markup, shared by every rendering path: the
 * server-rendered template shells (web-chat, the Studio editor, the admin and
 * account consoles) interpolate the full strip, and the dashboard injects
 * this inner markup into its React tree. One implementation, so the chrome
 * cannot drift between surfaces again.
 */
export function renderConsoleStripInnerHtml({
  surfaces,
  session,
  homeHref,
}: ConsoleStripHtmlOptions): string {
  const home =
    homeHref ??
    surfaces.find((surface) => surface.id === "dashboard")?.href ??
    surfaces.find((surface) => surface.isActive)?.href ??
    "/";
  const links = surfaces
    .map(
      (surface) =>
        `<a class="surface-nav-link${surface.isActive ? " is-active" : ""}" href="${escapeHtml(surface.href)}" data-console-surface="${escapeHtml(surface.id)}">${escapeHtml(surface.label)}</a>`,
    )
    .join("");
  return (
    `<a class="console-mark" href="${escapeHtml(home)}" aria-label="Console home"><span class="pulse"></span><span>Brain <span class="console-mark-long">· <b>Console</b></span></span></a>` +
    `<nav class="surface-nav" aria-label="Console surfaces">${links}</nav>` +
    `<button class="command-chip" type="button" aria-label="Search or jump"><span class="command-chip-hint">Search or jump…</span><kbd>⌘K</kbd><span class="command-chip-icon" aria-hidden="true">⌕</span></button>` +
    `<button id="climateToggle" class="climate-chip" type="button" aria-label="Toggle climate">◐</button>` +
    renderSessionChip(session)
  );
}

/**
 * The console strip as a complete HTML string, for surfaces whose shell is a
 * server-rendered template hosting a React bundle: the chrome paints before
 * the bundle loads and its inputs are server-side values.
 */
export function renderConsoleStripHtml(
  options: ConsoleStripHtmlOptions,
): string {
  return (
    `<header class="console-strip" aria-label="Console surfaces">` +
    renderConsoleStripInnerHtml(options) +
    `</header>`
  );
}
