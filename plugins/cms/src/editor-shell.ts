/**
 * HTML shell for the first-party CMS editor.
 *
 * Mirrors web-chat's chat-page: a root element plus a module script tag
 * pointing at the Bun-bundled React app. Carries the operator-console
 * identity base (Fraunces + IBM Plex, warm paper, grain overlay) from
 * docs/cms-editor-mockups.html; component styles live in the app bundle.
 */
export function renderEditorShellHtml(options: { assetPath: string }): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Content Studio</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght,SOFT@0,9..144,300..900,0..100;1,9..144,300..900,0..100&family=IBM+Plex+Sans:ital,wght@0,400;0,450;0,500;0,600;1,400&family=IBM+Plex+Mono:ital,wght@0,400;0,500;1,400&display=swap" rel="stylesheet" />
    <style>
      :root {
        --paper: #f4efe6;
        --paper-deep: #ece5d6;
        --panel: #faf7f0;
        --ink: #211d18;
        --ink-60: rgba(33, 29, 24, 0.62);
        --ink-40: rgba(33, 29, 24, 0.42);
        --ink-15: rgba(33, 29, 24, 0.15);
        --ink-08: rgba(33, 29, 24, 0.08);
        --vermilion: #c44a1d;
        --vermilion-deep: #a03a13;
        --verdigris: #3d6b5c;
        --verdigris-soft: rgba(61, 107, 92, 0.14);
        --amber: #b3801a;
        --hairline: 1px solid var(--ink-15);
        --display: "Fraunces", serif;
        --ui: "IBM Plex Sans", sans-serif;
        --mono: "IBM Plex Mono", monospace;
      }
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body {
        font-family: var(--ui);
        background: var(--paper);
        color: var(--ink);
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
      ::selection { background: rgba(196, 74, 29, 0.22); }
      [data-cms-root] > .boot {
        font-family: var(--mono);
        font-size: 12px;
        letter-spacing: 0.14em;
        text-transform: uppercase;
        color: var(--ink-40);
        padding: 48px;
      }
    </style>
  </head>
  <body>
    <main id="root" data-cms-root><p class="boot">Opening the content studio…</p></main>
    <script type="module" src="${options.assetPath}"></script>
  </body>
</html>`;
}
