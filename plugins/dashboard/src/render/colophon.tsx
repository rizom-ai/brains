/** @jsxImportSource preact */
import type { AppInfo } from "@brains/plugins";
import { resolveUrl } from "@brains/utils";
import type { JSX } from "preact";

function findDocsUrl(
  appInfo: AppInfo,
  baseUrl: string | undefined,
): string | null {
  const docsEndpoint = appInfo.endpoints.find((endpoint) =>
    endpoint.label.toLowerCase().includes("doc"),
  );

  if (!docsEndpoint) {
    return null;
  }

  return resolveUrl(docsEndpoint.url, baseUrl);
}

export function Colophon(props: {
  title: string;
  appInfo: AppInfo;
  baseUrl: string | undefined;
}): JSX.Element {
  const { title, appInfo, baseUrl } = props;
  const docsUrl = findDocsUrl(appInfo, baseUrl);

  return (
    <footer class="colophon">
      <span class="colophon-mark">{title} · dashboard</span>
      <span class="colophon-actions">
        {docsUrl && (
          <a href={docsUrl} target="_blank" rel="noopener noreferrer">
            Docs ↗
          </a>
        )}
        <button id="themeToggle">Light mode</button>
      </span>
    </footer>
  );
}
