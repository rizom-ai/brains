import { escapeHtml } from "@brains/utils";
import type { AppInfo } from "@brains/plugins";

/**
 * Split the brand string so the last word can get the italic-accent
 * treatment (e.g. `Rizom <em>Collective</em>`). Single-word titles
 * render unchanged.
 */
function renderBrandTitle(title: string): string {
  const trimmed = title.trim();
  const lastSpace = trimmed.lastIndexOf(" ");
  if (lastSpace <= 0) return escapeHtml(trimmed);
  return `${escapeHtml(trimmed.slice(0, lastSpace))} <em>${escapeHtml(
    trimmed.slice(lastSpace + 1),
  )}</em>`;
}

function formatRendered(date: Date): string {
  const pad = (n: number): string => String(n).padStart(2, "0");
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    ` ${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}

export function renderMasthead(options: {
  title: string;
  tagline: string | undefined;
  appInfo: AppInfo;
  now: Date;
}): string {
  const { title, tagline, appInfo, now } = options;
  const plugins = appInfo.daemons.length;
  return `<header class="masthead">
    <div>
      <div class="eyebrow"><span class="pulse"></span>Brain · Operator Console</div>
      <h1 class="brand">${renderBrandTitle(title)}</h1>
      ${tagline ? `<p class="sub-deck">${escapeHtml(tagline)}</p>` : ""}
    </div>
    <div class="masthead-meta">
      <div class="line"><span class="label">build</span><span>v${escapeHtml(appInfo.version)}</span></div>
      <div class="line"><span class="label">plugins</span><span>${escapeHtml(plugins)} active</span></div>
      <div class="line"><span class="label">rendered</span><span>${escapeHtml(formatRendered(now))}</span></div>
    </div>
  </header>`;
}
