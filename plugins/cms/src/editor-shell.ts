import {
  CONSOLE_CLIMATE_SCRIPT,
  CONSOLE_FONTS_URL,
  CONSOLE_PALETTE_SCRIPT,
  CONSOLE_THEME_CSS,
  renderConsoleStripHtml,
  type ConsoleSurface,
} from "@brains/console-theme";

export interface EditorShellOptions {
  /** Module path of the Bun-bundled React app. */
  assetPath: string;
  /** Normalized configured mount used by client routing and API requests. */
  basePath: string;
  /** Console-strip doors, derived from the registered web routes. */
  surfaces: ConsoleSurface[];
  /** Sign-out link for the authenticated-session chip. */
  sessionHref: string;
}

/**
 * HTML shell for the first-party CMS editor.
 *
 * Mirrors web-chat's chat-page: the console strip above a root element plus
 * a module script tag pointing at the Bun-bundled React app. Palette and
 * type ramp come from the shared @brains/console-theme sheet — the CMS
 * defaults to the paper climate; the console-wide stored preference wins.
 * Component styles live in the app bundle.
 */
export function renderEditorShellHtml(options: EditorShellOptions): string {
  const basePath = options.basePath
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
  return `<!doctype html>
<html lang="en" data-climate="paper">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <title>Content Studio</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="${CONSOLE_FONTS_URL}" rel="stylesheet" />
    <script>${CONSOLE_CLIMATE_SCRIPT}</script>
    <script>${CONSOLE_PALETTE_SCRIPT}</script>
    <style>
${CONSOLE_THEME_CSS}
      * { margin: 0; padding: 0; box-sizing: border-box; }
      html, body { height: 100%; }
      body {
        font-family: var(--console-ui);
        background: var(--console-frame);
        color: var(--console-text);
        font-size: 14px;
        line-height: 1.5;
        -webkit-font-smoothing: antialiased;
        display: flex;
        flex-direction: column;
      }
      body::before {
        content: "";
        position: fixed; inset: 0;
        pointer-events: none;
        z-index: 999;
        opacity: 0.5;
        background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3CfeComponentTransfer%3E%3CfeFuncA type='linear' slope='0.035'/%3E%3C/feComponentTransfer%3E%3C/filter%3E%3Crect width='120' height='120' filter='url(%23n)'/%3E%3C/svg%3E");
      }
      ::selection { background: color-mix(in srgb, var(--console-accent) 22%, transparent); }
      [data-cms-root] {
        flex: 1;
        min-height: 0;
        display: flex;
        flex-direction: column;
      }
      [data-cms-root] > .boot {
        font-family: var(--console-mono);
        font-size: 12px;
        letter-spacing: 0.14em;
        text-transform: uppercase;
        color: var(--console-text-muted);
        padding: 48px;
      }
    </style>
  </head>
  <body>
    ${renderConsoleStripHtml(options)}
    <main id="root" data-cms-root data-cms-base-path="${basePath}"><p class="boot">Opening the content studio…</p></main>
    <script type="module" src="${options.assetPath}"></script>
  </body>
</html>`;
}
