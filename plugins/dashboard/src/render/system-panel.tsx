/** @jsxImportSource react */
import { displayLinkLabel, resolveUrl } from "@brains/utils/string-utils";
import type { JSX } from "react";
import type { DashboardRenderInput } from "./types";

interface PublicSurface {
  key: string;
  label: string;
  priority: number;
  state: "online" | "soon" | "offline";
}

function formatUptime(seconds: number): string {
  const totalSeconds = Math.max(0, Math.floor(seconds));
  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);

  if (days > 0) {
    return `${days}d ${String(hours).padStart(2, "0")}h ${String(minutes).padStart(2, "0")}m`;
  }
  if (hours > 0) return `${hours}h ${String(minutes).padStart(2, "0")}m`;
  return `${minutes}m`;
}

function formatRendered(date: Date): string {
  const pad = (value: number): string => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function surfaceKey(href: string, baseUrl: string | undefined): string {
  try {
    const resolved = new URL(href, baseUrl);
    resolved.hash = "";
    return resolved.toString().replace(/\/$/, "");
  } catch {
    return href.replace(/\/$/, "");
  }
}

function publicSurfaces(input: DashboardRenderInput): PublicSurface[] {
  const dashboardPath = input.dashboardPath ?? "/dashboard";
  const candidates: PublicSurface[] = [
    {
      key: surfaceKey(dashboardPath, input.baseUrl),
      label: "Dashboard",
      priority: 0,
      state: "online",
    },
    ...input.appInfo.interactions.map((interaction): PublicSurface => ({
      key: surfaceKey(interaction.href, input.baseUrl),
      label: displayLinkLabel(interaction.label),
      priority: interaction.priority,
      state:
        interaction.status === "available"
          ? ("online" as const)
          : interaction.status === "coming-soon"
            ? ("soon" as const)
            : ("offline" as const),
    })),
    ...input.appInfo.endpoints.map((endpoint): PublicSurface => ({
      key: surfaceKey(resolveUrl(endpoint.url, input.baseUrl), input.baseUrl),
      label: displayLinkLabel(endpoint.label),
      priority: endpoint.priority,
      state: "online",
    })),
  ];
  candidates.sort(
    (left, right) =>
      left.priority - right.priority || left.label.localeCompare(right.label),
  );

  const seen = new Set<string>();
  return candidates.filter((surface) => {
    if (seen.has(surface.key)) return false;
    seen.add(surface.key);
    return true;
  });
}

function SurfaceStatus({
  state,
}: {
  state: PublicSurface["state"];
}): JSX.Element {
  const label =
    state === "online" ? "Online" : state === "soon" ? "Soon" : "Offline";
  return <small data-state={state}>{label}</small>;
}

function CheckStatus({ current }: { current: boolean }): JSX.Element {
  return (
    <span
      className={`system-status-pill ${current ? "is-current" : "is-waiting"}`}
    >
      {current ? "current" : "waiting"}
    </span>
  );
}

export function SystemPanel({
  input,
  now,
  knowledgeMapPoints,
  knowledgeMapZones,
  hasKnowledgeMap,
  hasNetworkMap,
  networkCount,
}: {
  input: DashboardRenderInput;
  now: Date;
  knowledgeMapPoints: number;
  knowledgeMapZones: number;
  hasKnowledgeMap: boolean;
  hasNetworkMap: boolean;
  networkCount: number;
}): JSX.Element {
  const surfaces = publicSurfaces(input);
  const onlineCount = surfaces.filter(
    (surface) => surface.state === "online",
  ).length;
  const hasOfflineSurface = surfaces.some(
    (surface) => surface.state === "offline",
  );
  const healthy = !hasOfflineSurface;

  return (
    <section
      id="system"
      className="dashboard-tab-panel"
      data-dashboard-tab-panel
      data-dashboard-group="system"
      data-ui-panel="system"
      role="tabpanel"
      aria-labelledby="dashboard-tab-system"
    >
      <header className="tab-section-head">
        <h2>System</h2>
      </header>
      <div className="system-layout">
        <div className="system-main">
          <article className="card system-health-card">
            <div className="card-head">
              <span className="card-title">System health</span>
              <span className="card-from">public snapshot · just now</span>
            </div>
            <div className="system-health-lead">
              <span
                className={`system-health-orbit${healthy ? " is-healthy" : " is-degraded"}`}
                aria-hidden="true"
              >
                <i></i>
              </span>
              <div>
                <strong>
                  {healthy
                    ? "All public systems operational"
                    : "A public surface needs attention"}
                </strong>
                <p>
                  {healthy
                    ? "No advertised public surface reports an outage."
                    : "One or more advertised public surfaces are unavailable."}
                </p>
              </div>
              <span
                className={`system-health-pill${healthy ? " is-healthy" : " is-degraded"}`}
              >
                {healthy ? "Healthy" : "Attention"}
              </span>
            </div>
            <div className="system-health-metrics">
              <div>
                <span>Public surfaces</span>
                <strong>
                  {onlineCount} / {surfaces.length}
                </strong>
                <small>online</small>
              </div>
              <div>
                <span>Knowledge map</span>
                <strong>{hasKnowledgeMap ? "Current" : "Waiting"}</strong>
                <small>projection</small>
              </div>
              <div>
                <span>Network map</span>
                <strong>{hasNetworkMap ? "Current" : "Waiting"}</strong>
                <small>directory</small>
              </div>
            </div>
          </article>

          <article className="card system-index-card">
            <div className="card-head">
              <span className="card-title">Semantic index</span>
              <span className="card-from">public projection</span>
            </div>
            <div className="system-index-gauge">
              <div
                className={`system-index-ring${hasKnowledgeMap ? " is-ready" : ""}`}
                aria-label={
                  hasKnowledgeMap
                    ? "Public semantic projection is ready"
                    : "Public semantic projection is waiting for data"
                }
              >
                <span>{hasKnowledgeMap ? "Live" : "—"}</span>
              </div>
              <div className="system-index-copy">
                <strong>{hasKnowledgeMap ? "Ready" : "Awaiting data"}</strong>
                <p>
                  {hasKnowledgeMap
                    ? "The public knowledge projection is current."
                    : "The projection will appear when public topics are indexed."}
                </p>
                <div className="system-inline-facts">
                  <span>{input.appInfo.entities} entities</span>
                  <span>{knowledgeMapZones} territories</span>
                  <span>{knowledgeMapPoints} points</span>
                </div>
              </div>
            </div>
          </article>

          <article className="card system-content-card">
            <div className="card-head">
              <span className="card-title">Public content</span>
              <span className="card-from">dashboard render</span>
            </div>
            <dl className="system-kv">
              <div>
                <dt>Knowledge map</dt>
                <dd>
                  <i data-state={hasKnowledgeMap ? "online" : "waiting"}></i>
                  {hasKnowledgeMap ? "Current" : "Waiting"}
                </dd>
              </div>
              <div>
                <dt>Network map</dt>
                <dd>
                  <i data-state={hasNetworkMap ? "online" : "waiting"}></i>
                  {hasNetworkMap ? "Current" : "Waiting"}
                </dd>
              </div>
              <div>
                <dt>Public entities</dt>
                <dd>{input.appInfo.entities}</dd>
              </div>
            </dl>
            <div
              className="system-pipeline"
              aria-label="Public content pipeline"
            >
              <span className="is-done">entities</span>
              <i></i>
              <span className={hasKnowledgeMap ? "is-done" : ""}>indexed</span>
              <i></i>
              <span className="is-done">published</span>
            </div>
          </article>

          <article className="card system-checks-card">
            <div className="card-head">
              <span className="card-title">Public system checks</span>
              <span className="card-from">this render</span>
            </div>
            <div className="system-checks-head">
              <span>Operation</span>
              <span>Updated</span>
              <span>Status</span>
            </div>
            <div className="system-check-row">
              <div>
                <strong>public-card-render</strong>
                <small>
                  dashboard · {input.appInfo.entities} public entities
                </small>
              </div>
              <span>now</span>
              <CheckStatus current />
            </div>
            <div className="system-check-row">
              <div>
                <strong>knowledge-map-refresh</strong>
                <small>topics · {knowledgeMapZones} public territories</small>
              </div>
              <span>this render</span>
              <CheckStatus current={hasKnowledgeMap} />
            </div>
            <div className="system-check-row">
              <div>
                <strong>agent-proximity-scan</strong>
                <small>agent-discovery · {networkCount} public agents</small>
              </div>
              <span>this render</span>
              <CheckStatus current={hasNetworkMap} />
            </div>
          </article>
        </div>

        <aside className="system-side">
          <article className="card system-runtime-card">
            <div className="card-head">
              <span className="card-title">Runtime</span>
              <span className="card-from">public metadata</span>
            </div>
            <dl className="system-kv">
              <div>
                <dt>Version</dt>
                <dd>v{input.appInfo.version}</dd>
              </div>
              <div>
                <dt>Uptime</dt>
                <dd>{formatUptime(input.appInfo.uptime)}</dd>
              </div>
              <div>
                <dt>Entities</dt>
                <dd>{input.appInfo.entities} public</dd>
              </div>
              <div>
                <dt>Surfaces</dt>
                <dd>
                  {onlineCount}/{surfaces.length} online
                </dd>
              </div>
              <div>
                <dt>Rendered</dt>
                <dd>
                  <time dateTime={now.toISOString()}>
                    {formatRendered(now)}
                  </time>
                </dd>
              </div>
            </dl>
          </article>

          <article className="card system-surfaces-card">
            <div className="card-head">
              <span className="card-title">Public surfaces</span>
              <span className="card-from">{onlineCount} online</span>
            </div>
            <ul>
              {surfaces.slice(0, 5).map((surface) => (
                <li key={surface.key}>
                  <span>
                    <i data-state={surface.state}></i>
                    <strong>{surface.label}</strong>
                  </span>
                  <SurfaceStatus state={surface.state} />
                </li>
              ))}
            </ul>
          </article>

          <article className="card system-scope-card">
            <div className="card-head">
              <span className="card-title">Visibility</span>
              <span className="system-scope-mark">Public</span>
            </div>
            <p>
              This view reports public service health only. Private memory,
              internal paths, and operator activity remain in Studio.
            </p>
          </article>
        </aside>
      </div>
    </section>
  );
}
