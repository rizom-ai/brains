import {
  CONSOLE_CLIMATE_SCRIPT,
  CONSOLE_FONTS_URL,
  CONSOLE_PALETTE_SCRIPT,
  CONSOLE_THEME_CSS,
  resolveConsoleThemeCSS,
} from "@brains/console-theme";
import { operatorApplicationDocumentClasses } from "@brains/operator-view-react";

function escapeAttribute(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

export interface EditorShellPrincipal {
  displayName: string;
  role: "admin" | "trusted" | "public";
}

export interface EditorShellOptions {
  /** Module path of the Bun-bundled React app. */
  assetPath: string;
  /** Static StyleX stylesheet emitted beside the app bundle. */
  stylesheetPath?: string | undefined;
  /** Normalized configured mount used by client routing and API requests. */
  basePath: string;
  /** Sign-out target exposed to Studio's identity menu. */
  sessionHref: string;
  /** Public Dashboard target exposed to Studio's identity menu. */
  dashboardHref: string;
  /** Active brain identity shown in Studio's wordmark. */
  brandName: string;
  /** Runtime-resolved brain theme; the shared default is used when absent. */
  themeCSS?: string | undefined;
  principal?: EditorShellPrincipal | undefined;
}

/**
 * HTML shell for the first-party Studio editor.
 *
 * Hosts the Bun-bundled React app as the sole authenticated shell. Palette
 * and type ramp come from the shared @brains/console-theme sheet — Studio
 * defaults to the paper climate; the stored preference wins. The hydrated
 * app owns its compact context and identity chrome.
 */
export function renderEditorShellHtml(options: EditorShellOptions): string {
  const basePath = options.basePath
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
  const classes = operatorApplicationDocumentClasses();
  return `<!doctype html>
<html lang="en" data-climate="paper" data-theme="light">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <title>Content Studio</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="${CONSOLE_FONTS_URL}" rel="stylesheet" />
    <script>${CONSOLE_CLIMATE_SCRIPT}</script>
    <script>${CONSOLE_PALETTE_SCRIPT}</script>
    <style data-console-theme>
${resolveConsoleThemeCSS(options.themeCSS)}
    </style>
    <style data-studio-shell-styles>
${CONSOLE_THEME_CSS}
      * { margin: 0; padding: 0; box-sizing: border-box; }
      html, body { height: 100%; }
      ::selection { background: color-mix(in srgb, var(--console-accent) 22%, transparent); }
    </style>
    ${options.stylesheetPath ? `<link data-studio-app-styles rel="stylesheet" href="${escapeAttribute(options.stylesheetPath)}" />` : ""}
  </head>
  <body data-console-host="studio" class="${classes.body}">
    <main id="root" class="${classes.mount}" data-studio-root data-studio-base-path="${basePath}" data-studio-session-href="${escapeAttribute(options.sessionHref)}" data-studio-dashboard-href="${escapeAttribute(options.dashboardHref)}" data-studio-brand-name="${escapeAttribute(options.brandName)}"${
      options.principal
        ? ` data-studio-principal-name="${escapeAttribute(options.principal.displayName)}" data-studio-principal-role="${escapeAttribute(options.principal.role)}"`
        : ""
    }><p class="${classes.boot}">Opening the content studio…</p></main>
    <script type="module" src="${options.assetPath}"></script>
  </body>
</html>`;
}
