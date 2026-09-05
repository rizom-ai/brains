import { join } from "path";
import { escapeHtml } from "@brains/utils/string-utils";
import {
  CONSOLE_CLIMATE_SCRIPT,
  CONSOLE_PALETTE_SCRIPT,
  CONSOLE_THEME_CSS,
  resolveConsoleThemeCSS,
} from "@brains/console-theme";
import chatPageStyles from "./chat-page.css" with { type: "text" };
import responsiveShellStyles from "./responsive-shell.css" with { type: "text" };
import visualRefreshStyles from "./visual-refresh.css" with { type: "text" };

export const uiAssetPath: string = "/ask/assets/app.js";
export const uiAssetFile: string = join(
  import.meta.dir,
  "..",
  "dist",
  "ui",
  "app.js",
);
export const uiStylesheetPath: string = "/ask/assets/app.css";
export const uiStylesheetFile: string = join(
  import.meta.dir,
  "..",
  "dist",
  "ui",
  "app.css",
);

export interface ChatPageOptions {
  /** Configured root for the public headless Chat transport. */
  apiPath: string;
  /** Public Dashboard destination. */
  dashboardHref: string;
  /** Native authenticated Chat destination when Studio is installed. */
  studioHref?: string | undefined;
  /** Sign-out link for authenticated fallback rendering. */
  sessionHref: string;
  /** Runtime-resolved brain theme; the shared default is used when absent. */
  themeCSS?: string | undefined;
  principal?:
    | {
        displayName: string;
        role: "admin" | "trusted" | "public";
      }
    | undefined;
}

function principalInitials(displayName: string): string {
  return displayName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.slice(0, 1).toUpperCase())
    .join("");
}

function renderAskHeader(options: ChatPageOptions): string {
  const studioLink = options.studioHref
    ? `<a class="ask-header-link" href="${escapeHtml(options.studioHref)}">Open Studio</a>`
    : "";
  const sessionLabel = options.principal
    ? `${escapeHtml(options.principal.displayName)} · ${escapeHtml(options.principal.role)}`
    : "Authenticated";
  const sessionInitials = options.principal
    ? principalInitials(options.principal.displayName)
    : "AU";
  return `<header class="ask-header" aria-label="Ask"><a class="ask-header-brand" href="${escapeHtml(options.dashboardHref)}"><span class="ask-header-mark">B</span><span>Brain <b>/ Ask</b></span></a><nav class="ask-header-actions"><a class="ask-header-link" href="${escapeHtml(options.dashboardHref)}">Dashboard</a>${studioLink}<button id="climateToggle" class="ask-header-climate" type="button" aria-label="Toggle climate">◐</button><a class="ask-header-identity" href="${escapeHtml(options.sessionHref)}" aria-label="${sessionLabel} · Sign out">${escapeHtml(sessionInitials)}</a></nav></header>`;
}

export function renderChatPage(options: ChatPageOptions): string {
  // The climate script runs before first paint to apply the console-wide
  // stored preference; the shared sheet supplies the palette both climates
  // resolve from. No webfont link here: the chat page deliberately makes no
  // third-party requests, so the console type ramp falls back to system
  // stacks until fonts are self-hosted.
  return `<!doctype html><html lang="en" data-climate="instrument" data-theme="dark"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover"><title>Brain Chat</title><script>${CONSOLE_CLIMATE_SCRIPT}</script><script>${CONSOLE_PALETTE_SCRIPT}</script><style data-console-theme>${resolveConsoleThemeCSS(options.themeCSS, { imports: "remove" })}</style><style data-web-chat-styles>${CONSOLE_THEME_CSS}

${chatPageStyles}

${responsiveShellStyles}

${visualRefreshStyles}</style><link data-web-chat-app-styles rel="stylesheet" href="${uiStylesheetPath}"></head><body>${renderAskHeader(options)}<main id="root" data-web-chat-root data-chat-api-path="${escapeHtml(options.apiPath)}">Brain Chat</main><script type="module" src="${uiAssetPath}"></script></body></html>`;
}
