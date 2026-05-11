/** @jsxImportSource preact */
import type { AppInfo } from "@brains/plugins";
import { displayLinkLabel, resolveUrl } from "@brains/utils";
import type { JSX } from "preact";

function endpointHost(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.host + parsed.pathname.replace(/\/$/, "");
  } catch {
    return url;
  }
}

export function EndpointsCard(props: {
  endpoints: AppInfo["endpoints"];
  baseUrl: string | undefined;
}): JSX.Element | null {
  const { endpoints, baseUrl } = props;

  if (endpoints.length === 0) {
    return null;
  }

  const sorted = [...endpoints].sort(
    (a, b) => a.priority - b.priority || a.label.localeCompare(b.label),
  );

  return (
    <aside class="card">
      <div class="card-head">
        <span class="card-title">Endpoints</span>
      </div>
      <dl class="links">
        {sorted.map((endpoint) => {
          const resolved = resolveUrl(endpoint.url, baseUrl);
          return (
            <a
              key={`${endpoint.label}:${endpoint.url}`}
              class="link"
              href={resolved}
              target="_blank"
              rel="noopener noreferrer"
            >
              <dt>{displayLinkLabel(endpoint.label)}</dt>
              <dd>{endpointHost(resolved)}</dd>
              <span class="arrow">↗</span>
            </a>
          );
        })}
      </dl>
    </aside>
  );
}
