import type { AuthAccountRole } from "@brains/auth-service/account-contracts";
import {
  CONSOLE_CLIMATE_SCRIPT,
  CONSOLE_FONTS_URL,
  CONSOLE_PALETTE_SCRIPT,
  CONSOLE_THEME_CSS,
  renderConsoleStripHtml,
  type ConsoleSurface,
} from "@brains/console-theme";

export interface AccountShellOptions {
  assetPath: string;
  routePath: string;
  displayName: string;
  role: AuthAccountRole;
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

export function renderAccountShellHtml(options: AccountShellOptions): string {
  return `<!doctype html>
<html lang="en" data-climate="instrument">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <title>Account · Brain Console</title>
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
        color: var(--console-text);
        background:
          radial-gradient(circle at 82% 8%, var(--console-accent-soft), transparent 29rem),
          linear-gradient(180deg, var(--console-frame), var(--console-bg) 19rem);
        font-family: var(--console-ui);
        font-size: 14px;
        line-height: 1.5;
        -webkit-font-smoothing: antialiased;
      }
      body::before {
        content: "";
        position: fixed;
        inset: 0;
        z-index: 999;
        pointer-events: none;
        opacity: 0.48;
        background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3CfeComponentTransfer%3E%3CfeFuncA type='linear' slope='.03'/%3E%3C/feComponentTransfer%3E%3C/filter%3E%3Crect width='120' height='120' filter='url(%23n)'/%3E%3C/svg%3E");
      }
      [data-account-root] > .boot {
        width: min(1180px, calc(100% - 48px));
        margin: 0 auto;
        padding: 72px 0;
        color: var(--console-text-muted);
        font: 10px var(--console-mono);
        letter-spacing: 0.14em;
        text-transform: uppercase;
      }
    </style>
  </head>
  <body>
    ${renderConsoleStripHtml(options)}
    <main
      id="root"
      data-account-root
      data-account-name="${escapeAttribute(options.displayName)}"
      data-account-role="${options.role}"
      data-account-route="${escapeAttribute(options.routePath)}"
    ><p class="boot">Opening your account…</p></main>
    <script type="module" src="${options.assetPath}"></script>
  </body>
</html>`;
}
