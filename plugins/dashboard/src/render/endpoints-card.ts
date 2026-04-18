import { escapeHtml, displayLinkLabel } from "@brains/utils";
import type { AppInfo } from "@brains/plugins";

function resolveUrl(url: string, baseUrl: string | undefined): string {
  if (!baseUrl) return url;
  try {
    return new URL(url, baseUrl).toString();
  } catch {
    return url;
  }
}

export function renderEndpointsCard(
  endpoints: AppInfo["endpoints"],
  baseUrl: string | undefined,
): string {
  if (endpoints.length === 0) return "";

  const sorted = [...endpoints].sort(
    (a, b) => a.priority - b.priority || a.label.localeCompare(b.label),
  );

  const rows = sorted
    .map((endpoint) => {
      const resolved = resolveUrl(endpoint.url, baseUrl);
      const host = (() => {
        try {
          return (
            new URL(resolved).host +
            new URL(resolved).pathname.replace(/\/$/, "")
          );
        } catch {
          return resolved;
        }
      })();
      return `<a class="link" href="${escapeHtml(
        resolved,
      )}" target="_blank" rel="noopener noreferrer"><dt>${escapeHtml(
        displayLinkLabel(endpoint.label),
      )}</dt><dd>${escapeHtml(host)}</dd><span class="arrow">↗</span></a>`;
    })
    .join("");

  return `<aside class="card">
    <div class="card-head">
      <span class="card-title">Endpoints</span>
    </div>
    <dl class="links">${rows}</dl>
  </aside>`;
}
