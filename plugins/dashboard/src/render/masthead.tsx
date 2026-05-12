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

function statusLabel(appInfo: AppInfo): string {
  const hasError = appInfo.daemons.some(
    (daemon) => daemon.health?.status === "error",
  );
  const hasWarning = appInfo.daemons.some(
    (daemon) => daemon.health?.status === "warning",
  );

  if (hasError) return "Degraded";
  if (hasWarning) return "Warning";
  return "Online";
}

export function Masthead(props: {
  title: string;
  tagline: string | undefined;
  appInfo: AppInfo;
  now: Date;
  operatorAccess: DashboardOperatorAccess | undefined;
}): JSX.Element {
  const { title, tagline, appInfo, operatorAccess } = props;
  const daemonCount = appInfo.daemons.length;
  const accessLabel = operatorAccess?.isOperator ? "Operator" : "Public view";

  return (
    <header class="masthead">
      <div class="eyebrow">
        <span class="pulse"></span>Brain · Operator Console
      </div>
      <h1 class="brand">
        <BrandTitle title={title} />
      </h1>
      {tagline && <p class="sub-deck">{tagline}</p>}

      <div class="scoreboard">
        <div class="scoreboard-tile">
          <div class="scoreboard-label">Status</div>
          <div class="scoreboard-value">{statusLabel(appInfo)}</div>
        </div>
        <div class="scoreboard-tile">
          <div class="scoreboard-label">Corpus</div>
          <div class="scoreboard-value">{appInfo.entities} entities</div>
        </div>
        <div class="scoreboard-tile">
          <div class="scoreboard-label">Embeddings</div>
          <div class="scoreboard-value">{appInfo.embeddings}</div>
        </div>
        <div class="scoreboard-tile">
          <div class="scoreboard-label">Daemons</div>
          <div class="scoreboard-value">{daemonCount} active</div>
        </div>
        <div class="scoreboard-tile">
          <div class="scoreboard-label">Access</div>
          <div class="scoreboard-value">
            {operatorAccess?.isOperator ? (
              <a href={operatorAccess.logoutUrl}>operator · sign out</a>
            ) : (
              accessLabel
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
