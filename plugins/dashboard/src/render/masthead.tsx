/** @jsxImportSource preact */
import type { AppInfo } from "@brains/plugins";
import type { JSX } from "preact";
import type { DashboardOperatorAccess } from "./types";

function BrandTitle({ title }: { title: string }): JSX.Element {
  const trimmed = title.trim();
  const lastSpace = trimmed.lastIndexOf(" ");

  if (lastSpace <= 0) {
    return <>{trimmed}</>;
  }

  return (
    <>
      {trimmed.slice(0, lastSpace)} <em>{trimmed.slice(lastSpace + 1)}</em>
    </>
  );
}

function formatRendered(date: Date): string {
  const pad = (n: number): string => String(n).padStart(2, "0");
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    ` ${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}

export function Masthead(props: {
  title: string;
  tagline: string | undefined;
  appInfo: AppInfo;
  now: Date;
  operatorAccess: DashboardOperatorAccess | undefined;
}): JSX.Element {
  const { title, tagline, appInfo, now, operatorAccess } = props;
  const plugins = appInfo.daemons.length;

  return (
    <header class="masthead">
      <div>
        <div class="eyebrow">
          <span class="pulse"></span>Brain · Operator Console
        </div>
        <h1 class="brand">
          <BrandTitle title={title} />
        </h1>
        {tagline && <p class="sub-deck">{tagline}</p>}
      </div>
      <div class="masthead-meta">
        <div class="line">
          <span class="label">build</span>
          <span>v{appInfo.version}</span>
        </div>
        <div class="line">
          <span class="label">plugins</span>
          <span>{plugins} active</span>
        </div>
        <div class="line">
          <span class="label">rendered</span>
          <span>{formatRendered(now)}</span>
        </div>
        {operatorAccess?.isOperator && (
          <div class="line">
            <span class="label">access</span>
            <a href={operatorAccess.logoutUrl}>operator · sign out</a>
          </div>
        )}
      </div>
    </header>
  );
}
