/** @jsxImportSource react */
import type { AppInfo } from "@brains/plugins";
import { resolveUrl } from "@brains/utils/string-utils";
import type { JSX } from "react";
import {
  OperatorFooter,
  OperatorFooterLink,
} from "@brains/operator-view-react";

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
    <OperatorFooter className="colophon" mark={<>{title} · dashboard</>}>
      <span>Runs on Brains {appInfo.version}</span>
      {docsUrl && (
        <OperatorFooterLink
          href={docsUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          Open source ↗
        </OperatorFooterLink>
      )}
      {operatorHref && (
        <OperatorFooterLink href={operatorHref}>
          Operators → Studio
        </OperatorFooterLink>
      )}
    </OperatorFooter>
  );
}
