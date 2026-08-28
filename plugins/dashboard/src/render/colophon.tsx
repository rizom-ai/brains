/** @jsxImportSource react */
import type { AppInfo } from "@brains/plugins";
import { resolveUrl } from "@brains/utils/string-utils";
import type { JSX } from "react";

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
  operatorHref?: string | undefined;
}): JSX.Element {
  const { title, appInfo, baseUrl, operatorHref } = props;
  const docsUrl = findDocsUrl(appInfo, baseUrl);

  return (
    <footer className="colophon">
      <span className="colophon-mark">{title} · dashboard</span>
      <span className="colophon-actions">
        <span>Runs on Brains {appInfo.version}</span>
        {docsUrl && (
          <a href={docsUrl} target="_blank" rel="noopener noreferrer">
            Open source ↗
          </a>
        )}
        {operatorHref && <a href={operatorHref}>Operators → Studio</a>}
      </span>
    </footer>
  );
}
