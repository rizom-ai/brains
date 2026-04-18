import { displayLinkLabel } from "@brains/utils";
import type { DashboardData, WidgetData } from "./widget-schema";

const KV_SKIP_KEYS = new Set(["rendered"]);
const DEFAULT_TITLE = "Brain Dashboard";

function escapeHtml(value: unknown): string {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function isEmptyValue(value: unknown): boolean {
  if (value === undefined || value === null || value === "") return true;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === "object") return Object.keys(value).length === 0;
  return false;
}

function formatRendered(date: Date): string {
  const pad = (n: number): string => String(n).padStart(2, "0");
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    ` ${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}

function pickProfileIdentity(widgets: WidgetData[]): {
  name?: string;
  tagline?: string;
} {
  for (const w of widgets) {
    if (w.widget.rendererName !== "ProfileWidget") continue;
    if (typeof w.data !== "object" || w.data === null) continue;
    const record = w.data as Record<string, unknown>;
    const result: { name?: string; tagline?: string } = {};
    if (typeof record["name"] === "string") result.name = record["name"];
    if (typeof record["description"] === "string")
      result.tagline = record["description"];
    return result;
  }
  return {};
}

function groupWidgetsBySection(widgets: Record<string, WidgetData>): {
  primary: WidgetData[];
  secondary: WidgetData[];
  sidebar: WidgetData[];
} {
  const groups = {
    primary: [] as WidgetData[],
    secondary: [] as WidgetData[],
    sidebar: [] as WidgetData[],
  };

  for (const widgetData of Object.values(widgets)) {
    groups[widgetData.widget.section].push(widgetData);
  }

  for (const section of Object.keys(groups) as Array<keyof typeof groups>) {
    groups[section].sort((a, b) => a.widget.priority - b.widget.priority);
  }

  return groups;
}

function stripLinks(record: Record<string, unknown>): {
  rest: Record<string, unknown>;
  links: Array<{ label: string; url: string }>;
} {
  const { links, ...rest } = record;
  const valid = Array.isArray(links)
    ? links.filter(
        (link): link is { label: string; url: string } =>
          typeof link === "object" &&
          link !== null &&
          "label" in link &&
          typeof link.label === "string" &&
          "url" in link &&
          typeof link.url === "string",
      )
    : [];
  return { rest, links: valid };
}

function renderKvRows(data: Record<string, unknown>): string {
  const entries = Object.entries(data).filter(
    ([key, value]) => !KV_SKIP_KEYS.has(key) && !isEmptyValue(value),
  );
  if (entries.length === 0) return "";

  return `<dl class="kv">${entries
    .map(([key, value]) => {
      const display =
        typeof value === "object" ? JSON.stringify(value) : String(value);
      return `<div class="kv-row"><dt>${escapeHtml(key)}</dt><dd>${escapeHtml(
        display,
      )}</dd></div>`;
    })
    .join("")}</dl>`;
}

function renderLinksSection(
  links: Array<{ label: string; url: string }>,
): string {
  if (links.length === 0) return "";

  return `<dl class="links">${links
    .map((link) => {
      const host = (() => {
        try {
          return (
            new URL(link.url).host +
            new URL(link.url).pathname.replace(/\/$/, "")
          );
        } catch {
          return link.url;
        }
      })();
      return `<a class="link" href="${escapeHtml(
        link.url,
      )}" target="_blank" rel="noopener noreferrer"><dt>${escapeHtml(
        displayLinkLabel(link.label),
      )}</dt><dd>${escapeHtml(host)}</dd><span class="arrow">↗</span></a>`;
    })
    .join("")}</dl>`;
}

function renderEntitiesBody(data: unknown): string {
  if (typeof data !== "object" || data === null) {
    return '<p class="muted">No data available</p>';
  }
  const source =
    "stats" in data && typeof data.stats === "object" && data.stats !== null
      ? (data.stats as Record<string, unknown>)
      : (data as Record<string, unknown>);

  const stats = Object.entries(source)
    .filter(([, value]) => typeof value === "number")
    .map(([key, value]) => [key, Number(value)] as const)
    .sort((a, b) => b[1] - a[1]);

  if (stats.length === 0) {
    return '<p class="muted">No data available</p>';
  }

  const total = stats.reduce((sum, [, value]) => sum + value, 0);
  const max = stats[0]?.[1] ?? 1;

  const breakdown = stats
    .map(([key, value]) => {
      const width = Math.max(4, Math.round((value / max) * 100));
      return `<div class="breakdown-row">
        <span class="breakdown-name">${escapeHtml(key)}</span>
        <span class="breakdown-count">${escapeHtml(value)}</span>
        <div class="breakdown-bar"><i style="width:${width}%"></i></div>
      </div>`;
    })
    .join("");

  return `<div class="entities">
    <div>
      <div class="hero-number">${escapeHtml(total)}</div>
      <div class="hero-label">indexed entities</div>
    </div>
    <div class="breakdown">${breakdown}</div>
  </div>`;
}

function renderIdentityBody(data: unknown): string {
  if (typeof data !== "object" || data === null) {
    return '<p class="muted">No data available</p>';
  }
  const record = data as Record<string, unknown>;

  const parts: string[] = [];
  if (typeof record["name"] === "string") {
    parts.push(
      `<div class="identity-name">${escapeHtml(record["name"])}</div>`,
    );
  }
  if (typeof record["role"] === "string") {
    parts.push(
      `<div class="identity-role">${escapeHtml(record["role"])}</div>`,
    );
  }
  if (typeof record["purpose"] === "string") {
    parts.push(
      `<p class="identity-purpose">${escapeHtml(record["purpose"])}</p>`,
    );
  }
  if (Array.isArray(record["values"])) {
    const tags = record["values"]
      .filter((v): v is string => typeof v === "string")
      .map((v) => `<span class="value">${escapeHtml(v)}</span>`)
      .join("");
    if (tags) parts.push(`<div class="values">${tags}</div>`);
  }
  return parts.join("");
}

function renderProfileBody(data: unknown): string {
  if (typeof data !== "object" || data === null) {
    return '<p class="muted">No data available</p>';
  }
  const record = data as Record<string, unknown>;
  const { rest, links } = stripLinks(record);
  const { name, description, ...remaining } = rest;

  const parts: string[] = [];
  if (typeof name === "string") {
    parts.push(`<div class="identity-name">${escapeHtml(name)}</div>`);
  }
  if (typeof description === "string") {
    parts.push(`<p class="identity-tagline">${escapeHtml(description)}</p>`);
  }
  const kv = renderKvRows(remaining);
  if (kv) parts.push(kv);
  const linksHtml = renderLinksSection(links);
  if (linksHtml) parts.push(linksHtml);
  return parts.join("");
}

function renderGenericBody(data: unknown): string {
  if (typeof data !== "object" || data === null) {
    return '<p class="muted">Nothing to show yet.</p>';
  }
  const { rest, links } = stripLinks(data as Record<string, unknown>);
  const kv = renderKvRows(rest);
  const linksHtml = renderLinksSection(links);
  if (!kv && !linksHtml) {
    return '<p class="muted">Nothing to show yet.</p>';
  }
  return `${kv}${linksHtml}`;
}

function renderWidgetBody(widgetData: WidgetData): string {
  const { rendererName } = widgetData.widget;
  switch (rendererName) {
    case "StatsWidget":
      return renderEntitiesBody(widgetData.data);
    case "IdentityWidget":
      return renderIdentityBody(widgetData.data);
    case "ProfileWidget":
      return renderProfileBody(widgetData.data);
    default:
      return renderGenericBody(widgetData.data);
  }
}

function renderCardHead(widget: WidgetData): string {
  return `<div class="card-head">
    <span class="card-title">${escapeHtml(widget.widget.title)}</span>
  </div>`;
}

function renderWideCard(widgetData: WidgetData, hero = false): string {
  const cls = hero ? "card card--hero" : "card card--wide";
  return `<article class="${cls}">
    ${renderCardHead(widgetData)}
    ${renderWidgetBody(widgetData)}
  </article>`;
}

function renderIdentityCard(widgets: WidgetData[]): string {
  if (widgets.length === 0) return "";
  const sections = widgets
    .map(
      (w) => `<div class="identity-section">
      <span class="card-title">${escapeHtml(w.widget.title)}</span>
      ${renderWidgetBody(w)}
    </div>`,
    )
    .join("");
  return `<aside class="card card-identity">${sections}</aside>`;
}

export function renderDashboardPageHtml(options: {
  title?: string;
  dashboardData: DashboardData;
}): string {
  const groups = groupWidgetsBySection(options.dashboardData.widgets);
  const profile = pickProfileIdentity(groups.sidebar);

  const suppliedTitle = options.title;
  const title =
    profile.name ??
    (suppliedTitle && suppliedTitle !== DEFAULT_TITLE
      ? suppliedTitle
      : DEFAULT_TITLE);
  const tagline = profile.tagline;

  const primaryHeroIndex = groups.primary.findIndex(
    (w) => w.widget.rendererName === "StatsWidget",
  );
  const mainCards: string[] = [];
  groups.primary.forEach((widget, i) => {
    mainCards.push(renderWideCard(widget, i === primaryHeroIndex));
  });
  groups.secondary.forEach((widget) => {
    mainCards.push(renderWideCard(widget, false));
  });

  const identityCard = renderIdentityCard(groups.sidebar);
  const rendered = formatRendered(new Date());

  return `<!doctype html>
<html lang="en" data-theme="dark">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(title)}</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght,SOFT@0,9..144,300..900,30..100;1,9..144,300..900,30..100&family=IBM+Plex+Sans:ital,wght@0,300;0,400;0,500;0,600;1,400&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet" />
    <style>
      :root {
        --ink:          #0a0819;
        --ink-raised:   #14112b;
        --ink-soft:     #1b1638;
        --ink-deep:     #05040f;

        --paper:        #f1eadd;
        --paper-dim:    #bfb7a6;
        --paper-mute:   #7a7263;
        --paper-faint:  #4a4459;

        --rule:         rgba(241, 234, 221, 0.07);
        --rule-strong:  rgba(241, 234, 221, 0.14);
        --rule-accent:  rgba(255, 139, 61, 0.45);

        --accent:       #ff8b3d;
        --accent-dim:   #c4611f;
        --accent-soft:  rgba(255, 139, 61, 0.12);

        --ok:           #68cc8b;
        --warn:         #f5c158;
        --err:          #e26d6d;
        --neutral:      #7a7263;

        --font-display: "Fraunces", "Times New Roman", serif;
        --font-body:    "IBM Plex Sans", -apple-system, system-ui, sans-serif;
        --font-mono:    "JetBrains Mono", ui-monospace, monospace;

        --shadow-card:  0 1px 0 rgba(255, 255, 255, 0.02) inset,
                        0 24px 48px -24px rgba(0, 0, 0, 0.55);

        color-scheme: dark;
      }

      [data-theme="light"] {
        --ink:          #ece3cd;
        --ink-raised:   #f6efdc;
        --ink-soft:     #e4dac1;
        --ink-deep:     #d4c8a8;

        --paper:        #1a1528;
        --paper-dim:    #4a4257;
        --paper-mute:   #7a7180;
        --paper-faint:  #a79d98;

        --rule:         rgba(26, 21, 40, 0.11);
        --rule-strong:  rgba(26, 21, 40, 0.22);
        --rule-accent:  rgba(180, 65, 12, 0.42);

        --accent:       #b8410c;
        --accent-dim:   #923208;
        --accent-soft:  rgba(184, 65, 12, 0.07);

        --ok:           #2f7b4d;
        --warn:         #8f5a10;
        --err:          #932f2f;
        --neutral:      #7a7180;

        --shadow-card:  0 1px 0 rgba(255, 250, 235, 0.6) inset,
                        0 1px 0 rgba(120, 90, 40, 0.05),
                        0 22px 40px -28px rgba(90, 60, 20, 0.28);

        color-scheme: light;
      }

      * { margin: 0; padding: 0; box-sizing: border-box; }
      html, body { min-height: 100%; }

      body {
        font-family: var(--font-body);
        font-size: 15px;
        line-height: 1.55;
        background: var(--ink);
        color: var(--paper);
        -webkit-font-smoothing: antialiased;
        position: relative;
      }

      body::before {
        content: "";
        position: fixed;
        inset: 0;
        pointer-events: none;
        opacity: 0.035;
        mix-blend-mode: overlay;
        background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='180' height='180'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.6 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>");
        z-index: 0;
      }
      [data-theme="light"] body::before { opacity: 0.06; mix-blend-mode: multiply; }

      body::after {
        content: "";
        position: fixed;
        inset: 0;
        pointer-events: none;
        background: radial-gradient(ellipse at 50% 0%,
          transparent 0%, transparent 45%, var(--ink-deep) 110%);
        opacity: 0.55;
        z-index: 0;
      }
      [data-theme="light"] body::after {
        background: radial-gradient(ellipse at 50% -10%,
          rgba(255, 250, 235, 0.6) 0%,
          transparent 40%,
          var(--ink-deep) 115%);
        opacity: 0.7;
      }

      .console {
        position: relative;
        z-index: 1;
        max-width: 1240px;
        margin: 0 auto;
        padding: 44px 32px 72px;
      }

      .masthead {
        display: grid;
        grid-template-columns: 1fr auto;
        gap: 24px;
        align-items: end;
        padding-bottom: 20px;
        margin-bottom: 36px;
        border-bottom: 1px solid var(--rule-strong);
        position: relative;
      }
      .masthead::after {
        content: "";
        position: absolute;
        left: 0;
        bottom: -1px;
        width: 84px;
        height: 1px;
        background: var(--accent);
      }

      .eyebrow {
        font-family: var(--font-mono);
        font-size: 10.5px;
        font-weight: 500;
        letter-spacing: 0.22em;
        text-transform: uppercase;
        color: var(--paper-mute);
        display: flex;
        align-items: center;
        gap: 10px;
        margin-bottom: 14px;
      }
      .eyebrow::before {
        content: "";
        width: 18px;
        height: 1px;
        background: var(--accent);
      }

      .brand {
        font-family: var(--font-display);
        font-variation-settings: "opsz" 144, "SOFT" 50, "wght" 380;
        font-size: clamp(2.75rem, 5.5vw, 4rem);
        line-height: 0.95;
        letter-spacing: -0.02em;
        color: var(--paper);
      }
      [data-theme="light"] .brand {
        font-variation-settings: "opsz" 144, "SOFT" 40, "wght" 420;
      }

      .sub-deck {
        margin-top: 14px;
        max-width: 56ch;
        color: var(--paper-dim);
        font-size: 14.5px;
        line-height: 1.5;
      }

      .masthead-meta {
        display: flex;
        flex-direction: column;
        align-items: flex-end;
        gap: 6px;
        font-family: var(--font-mono);
        font-size: 11px;
        color: var(--paper-mute);
        letter-spacing: 0.04em;
      }
      .masthead-meta .line { display: flex; align-items: center; gap: 8px; }
      .masthead-meta .label {
        text-transform: uppercase;
        font-size: 9.5px;
        letter-spacing: 0.2em;
        color: var(--paper-faint);
      }

      .pulse {
        width: 6px; height: 6px; border-radius: 50%;
        background: var(--ok);
        animation: pulse 2.4s ease-in-out infinite;
      }
      @keyframes pulse {
        0%, 100% { box-shadow: 0 0 0 0 rgba(104, 204, 139, 0.45); }
        50%      { box-shadow: 0 0 0 6px rgba(104, 204, 139, 0); }
      }

      .grid {
        display: grid;
        grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) 300px;
        gap: 20px;
        align-items: start;
      }
      @media (max-width: 1024px) {
        .grid { grid-template-columns: 1fr 1fr; }
        .grid .card-identity { grid-column: span 2; grid-row: auto; }
      }
      @media (max-width: 640px) {
        .console { padding: 28px 18px 56px; }
        .grid { grid-template-columns: 1fr; }
        .grid .card-identity { grid-column: span 1; }
        .masthead { grid-template-columns: 1fr; align-items: start; }
        .masthead-meta { align-items: flex-start; }
      }

      .card {
        background: var(--ink-raised);
        border: 1px solid var(--rule-strong);
        border-radius: 4px;
        padding: 22px 24px 24px;
        position: relative;
        box-shadow: var(--shadow-card);
      }
      .card--hero  { grid-column: span 2; padding: 28px 32px 32px; }
      .card--wide  { grid-column: span 2; }
      .card-identity {
        grid-row: span 4;
        padding: 24px;
        display: flex;
        flex-direction: column;
        gap: 22px;
      }

      .card-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
        margin-bottom: 18px;
      }
      .card-title {
        font-family: var(--font-mono);
        font-size: 10.5px;
        font-weight: 600;
        letter-spacing: 0.22em;
        text-transform: uppercase;
        color: var(--paper-mute);
        display: inline-flex;
        align-items: center;
        gap: 10px;
      }
      .card-title::before {
        content: "";
        width: 4px;
        height: 4px;
        background: var(--accent);
        border-radius: 50%;
      }
      .card-subtitle {
        font-family: var(--font-mono);
        font-size: 10.5px;
        letter-spacing: 0.12em;
        color: var(--paper-faint);
        text-transform: uppercase;
      }

      .muted { color: var(--paper-mute); font-size: 13px; }

      .entities {
        display: grid;
        grid-template-columns: minmax(0, 1.05fr) minmax(0, 1.15fr);
        gap: 36px;
        align-items: end;
      }
      @media (max-width: 720px) {
        .entities { grid-template-columns: 1fr; gap: 24px; align-items: start; }
      }

      .hero-number {
        font-family: var(--font-display);
        font-variation-settings: "opsz" 144, "SOFT" 20, "wght" 350;
        font-size: clamp(5rem, 10vw, 7.5rem);
        line-height: 0.85;
        letter-spacing: -0.04em;
        color: var(--paper);
        font-variant-numeric: tabular-nums;
      }
      [data-theme="light"] .hero-number {
        font-variation-settings: "opsz" 144, "SOFT" 30, "wght" 420;
      }

      .hero-label {
        margin-top: 14px;
        font-family: var(--font-mono);
        font-size: 11px;
        letter-spacing: 0.18em;
        text-transform: uppercase;
        color: var(--paper-mute);
      }

      .breakdown {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 0;
      }
      .breakdown-row {
        display: grid;
        grid-template-columns: 1fr auto;
        align-items: baseline;
        gap: 12px;
        padding: 11px 0;
        border-top: 1px solid var(--rule);
      }
      .breakdown-row:nth-child(1),
      .breakdown-row:nth-child(2) { border-top: none; }
      .breakdown-row:nth-child(odd)  { padding-right: 18px; }
      .breakdown-row:nth-child(even) {
        padding-left: 18px;
        border-left: 1px solid var(--rule);
      }
      .breakdown-name { font-size: 13px; color: var(--paper-dim); }
      .breakdown-count {
        font-family: var(--font-mono);
        font-size: 14px;
        font-weight: 500;
        color: var(--paper);
        font-variant-numeric: tabular-nums;
        letter-spacing: -0.01em;
      }
      .breakdown-bar {
        grid-column: 1 / -1;
        margin-top: 6px;
        height: 1px;
        background: var(--rule);
        position: relative;
        overflow: hidden;
      }
      .breakdown-bar > i {
        position: absolute;
        inset: 0 auto 0 0;
        background: var(--accent);
        opacity: 0.55;
      }

      .identity-section { display: flex; flex-direction: column; gap: 6px; }
      .identity-section + .identity-section {
        padding-top: 22px;
        border-top: 1px solid var(--rule);
      }
      .identity-section .card-title { margin-bottom: 4px; }

      .identity-name {
        font-family: var(--font-display);
        font-variation-settings: "opsz" 48, "SOFT" 30, "wght" 420;
        font-size: 26px;
        line-height: 1.05;
        letter-spacing: -0.015em;
        color: var(--paper);
      }
      [data-theme="light"] .identity-name {
        font-variation-settings: "opsz" 48, "SOFT" 30, "wght" 480;
      }
      .identity-tagline {
        font-size: 13.5px;
        line-height: 1.55;
        color: var(--paper-dim);
        margin-top: 4px;
      }
      .identity-role {
        font-size: 14px;
        font-weight: 500;
        color: var(--paper);
      }
      .identity-purpose {
        font-size: 13px;
        line-height: 1.55;
        color: var(--paper-dim);
      }
      .values { display: flex; flex-wrap: wrap; gap: 4px 6px; margin-top: 8px; }
      .value {
        font-family: var(--font-mono);
        font-size: 10px;
        letter-spacing: 0.08em;
        text-transform: lowercase;
        color: var(--paper-dim);
        padding: 3px 8px;
        border: 1px solid var(--rule-strong);
        border-radius: 100px;
      }

      .kv { display: flex; flex-direction: column; }
      .kv-row {
        display: grid;
        grid-template-columns: 1fr auto;
        gap: 16px;
        align-items: baseline;
        padding: 8px 0;
        border-top: 1px solid var(--rule);
      }
      .kv-row:first-child { border-top: none; }
      .kv-row dt {
        font-size: 12px;
        color: var(--paper-mute);
        font-family: var(--font-mono);
        letter-spacing: 0.06em;
        text-transform: uppercase;
      }
      .kv-row dd {
        font-size: 13px;
        color: var(--paper);
        font-variant-numeric: tabular-nums;
        text-align: right;
        word-break: break-word;
      }

      .links { display: flex; flex-direction: column; }
      .link {
        display: grid;
        grid-template-columns: 72px 1fr auto;
        gap: 12px;
        align-items: baseline;
        padding: 10px 0;
        border-top: 1px solid var(--rule);
        text-decoration: none;
        color: inherit;
        transition: color 0.15s ease;
      }
      .link:first-child { border-top: none; }
      .link dt {
        font-family: var(--font-mono);
        font-size: 10px;
        letter-spacing: 0.14em;
        text-transform: uppercase;
        color: var(--paper-mute);
      }
      .link dd {
        font-family: var(--font-mono);
        font-size: 12px;
        color: var(--paper-dim);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .link .arrow {
        font-family: var(--font-mono);
        color: var(--paper-faint);
        font-size: 12px;
        transition: transform 0.2s ease, color 0.2s ease;
      }
      .link:hover dd { color: var(--accent); }
      .link:hover .arrow { transform: translateX(3px); color: var(--accent); }

      .theme-toggle {
        position: fixed;
        bottom: 20px;
        right: 20px;
        background: var(--ink-raised);
        border: 1px solid var(--rule-strong);
        color: var(--paper-dim);
        padding: 8px 14px;
        border-radius: 100px;
        cursor: pointer;
        font-family: var(--font-mono);
        font-size: 10px;
        letter-spacing: 0.18em;
        text-transform: uppercase;
        z-index: 50;
        transition: color 0.15s ease, border-color 0.15s ease;
      }
      .theme-toggle:hover { color: var(--accent); border-color: var(--rule-accent); }

      @media (prefers-reduced-motion: no-preference) {
        .grid > * {
          opacity: 0;
          transform: translateY(8px);
          animation: rise 0.6s cubic-bezier(0.2, 0.7, 0.2, 1) forwards;
        }
        .grid > *:nth-child(1) { animation-delay: 0.05s; }
        .grid > *:nth-child(2) { animation-delay: 0.15s; }
        .grid > *:nth-child(3) { animation-delay: 0.25s; }
        .grid > *:nth-child(4) { animation-delay: 0.35s; }
        .grid > *:nth-child(5) { animation-delay: 0.45s; }
        .masthead { animation: rise 0.6s cubic-bezier(0.2, 0.7, 0.2, 1) both; }
        @keyframes rise { to { opacity: 1; transform: translateY(0); } }
      }
    </style>
  </head>
  <body>
    <main class="console" data-component="dashboard:dashboard">
      <header class="masthead">
        <div>
          <div class="eyebrow"><span class="pulse"></span>Brain · Operator Console</div>
          <h1 class="brand">${escapeHtml(title)}</h1>
          ${tagline ? `<p class="sub-deck">${escapeHtml(tagline)}</p>` : ""}
        </div>
        <div class="masthead-meta">
          <div class="line"><span class="label">rendered</span><span>${escapeHtml(rendered)}</span></div>
        </div>
      </header>

      <section class="grid">
        ${mainCards.join("")}
        ${identityCard}
      </section>
    </main>

    <button class="theme-toggle" id="themeToggle" aria-label="Toggle theme">Light mode</button>

    <script>
      (function () {
        var root = document.documentElement;
        var btn = document.getElementById("themeToggle");
        var stored = null;
        try { stored = localStorage.getItem("brain:dashboard:theme"); } catch (e) {}
        if (stored === "light" || stored === "dark") {
          root.setAttribute("data-theme", stored);
        }
        function sync() {
          btn.textContent = root.getAttribute("data-theme") === "dark" ? "Light mode" : "Dark mode";
        }
        btn.addEventListener("click", function () {
          var next = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
          root.setAttribute("data-theme", next);
          try { localStorage.setItem("brain:dashboard:theme", next); } catch (e) {}
          sync();
        });
        sync();
      })();
    </script>
  </body>
</html>
`;
}
