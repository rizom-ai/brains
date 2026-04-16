export const CMS_SHELL_PATH = "/_admin/cms";

export function renderCmsShellHtml(
  options: { cmsConfigPath?: string } = {},
): string {
  const cmsConfigPath = options.cmsConfigPath ?? "/cms-config";

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Content Manager</title>
    <script>
      window.CMS_CONFIG_URL = ${JSON.stringify(cmsConfigPath)};
    </script>
    <script src="https://unpkg.com/@sveltia/cms/dist/sveltia-cms.js"></script>
  </head>
  <body></body>
</html>
`;
}

export function renderAdminShellHtml(
  options: {
    cmsConfigPath?: string;
    cmsShellPath?: string;
    siteUrl?: string;
    previewUrl?: string;
  } = {},
): string {
  const cmsConfigPath = options.cmsConfigPath ?? "/cms-config";
  const cmsShellPath = options.cmsShellPath ?? CMS_SHELL_PATH;
  const siteUrl = options.siteUrl ?? "";
  const previewUrl = options.previewUrl ?? "";

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Brain Admin</title>
    <style>
      :root {
        color-scheme: light dark;
        --bg: #0b0f14;
        --panel: #121923;
        --muted: #8ea0b8;
        --text: #edf2f7;
        --border: #243041;
        --accent: #6ee7b7;
        --accent-2: #93c5fd;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        font-family: Inter, ui-sans-serif, system-ui, sans-serif;
        background: linear-gradient(180deg, #0b0f14 0%, #111827 100%);
        color: var(--text);
      }
      a { color: var(--accent-2); }
      .shell {
        max-width: 1120px;
        margin: 0 auto;
        padding: 32px 20px 48px;
      }
      .hero {
        display: flex;
        flex-direction: column;
        gap: 10px;
        margin-bottom: 24px;
      }
      .eyebrow {
        font-size: 12px;
        text-transform: uppercase;
        letter-spacing: 0.12em;
        color: var(--accent);
        font-weight: 700;
      }
      h1 {
        margin: 0;
        font-size: clamp(2rem, 4vw, 3rem);
        line-height: 1.05;
      }
      .lede {
        margin: 0;
        max-width: 780px;
        color: var(--muted);
        line-height: 1.6;
      }
      .tabs {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        margin: 24px 0 20px;
      }
      .tab,
      .link-chip {
        border: 1px solid var(--border);
        background: rgba(18, 25, 35, 0.92);
        color: var(--text);
        border-radius: 999px;
        padding: 10px 14px;
        font: inherit;
        text-decoration: none;
      }
      .tab { cursor: pointer; }
      .tab[data-active="true"] {
        border-color: var(--accent);
        color: var(--accent);
      }
      .panel[hidden] { display: none; }
      .grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
        gap: 14px;
      }
      .card {
        background: rgba(18, 25, 35, 0.92);
        border: 1px solid var(--border);
        border-radius: 18px;
        padding: 18px;
      }
      .card h2 {
        margin: 0 0 10px;
        font-size: 1rem;
      }
      .card p {
        margin: 0;
        color: var(--muted);
        line-height: 1.5;
      }
      .stack {
        display: flex;
        flex-direction: column;
        gap: 10px;
      }
      .stack a {
        word-break: break-all;
      }
      .cms-frame {
        width: 100%;
        min-height: 78vh;
        border: 1px solid var(--border);
        border-radius: 18px;
        background: white;
      }
    </style>
  </head>
  <body>
    <main class="shell">
      <header class="hero">
        <div class="eyebrow">Brain Admin</div>
        <h1>Manage your brain from one place.</h1>
        <p class="lede">
          Use the overview for operator links and environment checks, then switch to CMS to edit structured content.
        </p>
      </header>

      <nav class="tabs" aria-label="Admin sections">
        <button class="tab" type="button" data-tab="overview" data-active="true">Overview</button>
        <button class="tab" type="button" data-tab="cms" data-active="false">CMS</button>
        <a class="link-chip" href="${cmsConfigPath}" target="_blank" rel="noreferrer">Open cms-config</a>
      </nav>

      <section class="panel" data-panel="overview">
        <div class="grid">
          <article class="card">
            <h2>Content management</h2>
            <p>Open the CMS tab to edit markdown-backed entities with the generated schema for this brain.</p>
          </article>
          <article class="card">
            <h2>CMS config</h2>
            <div class="stack">
              <p>The shared HTTP host exposes the generated config at <a href="${cmsConfigPath}" target="_blank" rel="noreferrer">${cmsConfigPath}</a>.</p>
            </div>
          </article>
          ${siteUrl ? `<article class="card"><h2>Site</h2><div class="stack"><a href="${siteUrl}" target="_blank" rel="noreferrer">${siteUrl}</a></div></article>` : ""}
          ${previewUrl ? `<article class="card"><h2>Preview</h2><div class="stack"><a href="${previewUrl}" target="_blank" rel="noreferrer">${previewUrl}</a></div></article>` : ""}
        </div>
      </section>

      <section class="panel" data-panel="cms" hidden>
        <iframe
          class="cms-frame"
          title="Brain CMS"
          loading="lazy"
          data-cms-frame="true"
        ></iframe>
      </section>
    </main>

    <script>
      const cmsShellPath = ${JSON.stringify(cmsShellPath)};
      const tabs = Array.from(document.querySelectorAll("[data-tab]"));
      const panels = Array.from(document.querySelectorAll("[data-panel]"));
      const cmsFrame = document.querySelector("[data-cms-frame='true']");

      function showTab(tabName) {
        tabs.forEach((tab) => {
          tab.dataset.active = String(tab.dataset.tab === tabName);
        });

        panels.forEach((panel) => {
          panel.hidden = panel.dataset.panel !== tabName;
        });

        if (tabName === "cms" && cmsFrame && !cmsFrame.getAttribute("src")) {
          cmsFrame.setAttribute("src", cmsShellPath);
        }
      }

      tabs.forEach((tab) => {
        tab.addEventListener("click", () => {
          const tabName = tab.dataset.tab ?? "overview";
          showTab(tabName);
          window.location.hash = tabName;
        });
      });

      showTab(window.location.hash === "#cms" ? "cms" : "overview");
    </script>
  </body>
</html>
`;
}
