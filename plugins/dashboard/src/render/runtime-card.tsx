/** @jsxImportSource preact */
import type { AppInfo } from "@brains/plugins";
import type { JSX } from "preact";

function formatUptime(seconds: number): string {
  const totalSeconds = Math.max(0, Math.floor(seconds));
  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);

  if (days > 0) {
    return `${days}d ${String(hours).padStart(2, "0")}h ${String(minutes).padStart(2, "0")}m`;
  }

  if (hours > 0) {
    return `${hours}h ${String(minutes).padStart(2, "0")}m`;
  }

  return `${minutes}m`;
}

function formatRendered(date: Date): string {
  const pad = (n: number): string => String(n).padStart(2, "0");
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    ` ${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}

export function RuntimeCard(props: {
  appInfo: AppInfo;
  now: Date;
}): JSX.Element {
  const { appInfo, now } = props;

  return (
    <aside class="card runtime-card">
      <div class="card-head">
        <span class="card-title">Runtime</span>
      </div>
      <dl class="kv">
        <div class="kv-row">
          <dt>Version</dt>
          <dd>v{appInfo.version}</dd>
        </div>
        <div class="kv-row">
          <dt>Model</dt>
          <dd>{appInfo.model}</dd>
        </div>
        <div class="kv-row">
          <dt>Uptime</dt>
          <dd>{formatUptime(appInfo.uptime)}</dd>
        </div>
        <div class="kv-row">
          <dt>Embeddings</dt>
          <dd>{appInfo.embeddings}</dd>
        </div>
        <div class="kv-row">
          <dt>Rendered</dt>
          <dd>{formatRendered(now)}</dd>
        </div>
      </dl>
    </aside>
  );
}
