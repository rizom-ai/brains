import {
  CONSOLE_CLIMATE_SCRIPT,
  CONSOLE_FONTS_URL,
  CONSOLE_PALETTE_SCRIPT,
  CONSOLE_THEME_CSS,
  renderConsoleStripHtml,
  type ConsoleSurface,
} from "@brains/console-theme";
import type { AuthAdminRole } from "@brains/auth-service/admin-contracts";

export interface PeopleShellOptions {
  assetPath: string;
  routePath: string;
  displayName: string;
  role: AuthAdminRole;
  surfaces: ConsoleSurface[];
  sessionHref: string;
}

function escapeAttribute(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

export function renderPeopleShellHtml(options: PeopleShellOptions): string {
  return `<!doctype html>
<html lang="en" data-climate="instrument">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <title>Admin · Brain Console</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="${CONSOLE_FONTS_URL}" rel="stylesheet" />
    <script>${CONSOLE_CLIMATE_SCRIPT}</script>
    <script>${CONSOLE_PALETTE_SCRIPT}</script>
    <style>
${CONSOLE_THEME_CSS}
      * { box-sizing: border-box; }
      html, body { min-height: 100%; }
      body {
        margin: 0;
        font-family: var(--console-ui);
        background: var(--console-frame);
        color: var(--console-text);
        font-size: 14px;
        line-height: 1.5;
        -webkit-font-smoothing: antialiased;
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
      [data-people-root] > .boot {
        padding: 48px;
        color: var(--console-text-muted);
        font: 11px var(--console-mono);
        letter-spacing: 0.14em;
        text-transform: uppercase;
      }
    </style>
  </head>
  <body>
    ${renderConsoleStripHtml(options)}
    <main
      id="root"
      data-people-root
      data-people-role="${options.role}"
      data-people-name="${escapeAttribute(options.displayName)}"
      data-people-route="${escapeAttribute(options.routePath)}"
    ><p class="boot">Opening the admin console…</p></main>
    <script type="module" src="${options.assetPath}"></script>
  </body>
</html>`;
}
