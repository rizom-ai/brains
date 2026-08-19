/** @jsxImportSource preact */
import type { AppInfo } from "@brains/plugins";
import { displayLinkLabel, resolveUrl } from "@brains/utils/string-utils";
import type { JSX } from "preact";
import { CardHeader } from "@brains/ui-library";

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
    <aside className="card">
      <CardHeader title="Endpoints" />
      <dl className="links">
        {sorted.map((endpoint) => {
          const resolved = resolveUrl(endpoint.url, baseUrl);
          return (
            <a
              key={`${endpoint.label}:${endpoint.url}`}
              className="link"
              href={resolved}
              target="_blank"
              rel="noopener noreferrer"
            >
              <dt>{displayLinkLabel(endpoint.label)}</dt>
              <dd>{endpointHost(resolved)}</dd>
              <span className="arrow">↗</span>
            </a>
          );
        })}
      </dl>
    </aside>
  );
}
