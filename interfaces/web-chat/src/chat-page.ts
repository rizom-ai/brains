import { join } from "path";
import {
  CONSOLE_CLIMATE_SCRIPT,
  CONSOLE_THEME_CSS,
  type ConsoleSurface,
} from "@brains/console-theme";
import chatPageStyles from "./chat-page.css" with { type: "text" };

export const uiAssetPath: string = "/chat/assets/app.js";
export const uiAssetFile: string = join(
  import.meta.dir,
  "..",
  "dist",
  "ui",
  "app.js",
);

export interface ChatPageOptions {
  /** Console-strip doors, derived from the registered web routes. */
  surfaces: ConsoleSurface[];
  /** Sign-out link for the session chip (the page is operator-only). */
  sessionHref: string;
}

function renderConsoleStrip({
  surfaces,
  sessionHref,
}: ChatPageOptions): string {
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
    `<a class="console-mark" href="${home}" aria-label="Console home"><span class="pulse"></span><span>Brain · <b>Console</b></span></a>` +
    `<nav class="surface-nav" aria-label="Console surfaces">${links}</nav>` +
    `<button class="command-chip" type="button" aria-label="Command menu"><span class="command-chip-hint">Search or jump…</span><kbd>⌘K</kbd></button>` +
    `<a class="session-chip" href="${sessionHref}"><span>Operator</span><strong>Sign out</strong></a>` +
    `</header>`
  );
}

export function renderChatPage(options: ChatPageOptions): string {
  // The climate script runs before first paint to apply the console-wide
  // stored preference; the shared sheet supplies the palette both climates
  // resolve from. No webfont link here: the chat page deliberately makes no
  // third-party requests, so the console type ramp falls back to system
  // stacks until fonts are self-hosted.
  return `<!doctype html><html lang="en" data-climate="instrument"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Brain Chat</title><script>${CONSOLE_CLIMATE_SCRIPT}</script><style data-web-chat-styles>${CONSOLE_THEME_CSS}

${chatPageStyles}</style></head><body>${renderConsoleStrip(options)}<main id="root" data-web-chat-root>Brain Chat</main><script type="module" src="${uiAssetPath}"></script></body></html>`;
}
