/** @jsxImportSource react */
import { displayLinkLabel, resolveUrl } from "@brains/utils/string-utils";
import type { JSX } from "react";
import {
  OperatorSection,
  OperatorSectionHeading,
  OperatorPanel,
  OperatorColumns,
  OperatorFacts,
  OperatorStatusDot,
  OperatorStatusList,
  OperatorStatusSummary,
  OperatorStatusPill,
  OperatorReadiness,
  OperatorSteps,
  OperatorChecks,
  OperatorStats,
  OperatorPanelParagraph,
} from "@brains/operator-view-react";
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
    <OperatorSection
      id="system"
      className="dashboard-tab-panel"
      data-dashboard-tab-panel
      data-dashboard-group="system"
      data-ui-panel="system"
      role="tabpanel"
      aria-labelledby="dashboard-tab-system"
    >
      <OperatorSectionHeading>System</OperatorSectionHeading>
      <OperatorColumns
        density="compact"
        presentation="panels"
        primary={
          <>
            <OperatorPanel
              className="card system-health-card"
              fullWidth
              heading="System health"
              source="public snapshot · just now"
              inset="flush-bottom"
            >
              <OperatorStatusSummary
                tone={healthy ? "good" : "warn"}
                title={
                  healthy
                    ? "All public systems operational"
                    : "A public surface needs attention"
                }
                description={
                  healthy
                    ? "No advertised public surface reports an outage."
                    : "One or more advertised public surfaces are unavailable."
                }
                status={healthy ? "Healthy" : "Attention"}
              />
              <OperatorStats
                density="compact"
                presentation="band"
                items={[
                  {
                    label: "Public surfaces",
                    value: `${onlineCount} / ${surfaces.length}`,
                    caption: "online",
                    captionTone: "good",
                  },
                  {
                    label: "Knowledge map",
                    value: hasKnowledgeMap ? "Current" : "Waiting",
                    caption: "projection",
                    captionTone: "good",
                  },
                  {
                    label: "Network map",
                    value: hasNetworkMap ? "Current" : "Waiting",
                    caption: "directory",
                    captionTone: "good",
                  },
                ]}
              />
            </OperatorPanel>

            <OperatorPanel
              className="card system-index-card"
              heading="Semantic index"
              source="public projection"
            >
              <OperatorReadiness
                tone={hasKnowledgeMap ? "good" : "neutral"}
                indicator={hasKnowledgeMap ? "Live" : "—"}
                indicatorLabel={
                  hasKnowledgeMap
                    ? "Public semantic projection is ready"
                    : "Public semantic projection is waiting for data"
                }
                title={hasKnowledgeMap ? "Ready" : "Awaiting data"}
                description={
                  hasKnowledgeMap
                    ? "The public knowledge projection is current."
                    : "The projection will appear when public topics are indexed."
                }
                facts={[
                  `${input.appInfo.entities} entities`,
                  `${knowledgeMapZones} territories`,
                  `${knowledgeMapPoints} points`,
                ]}
              />
            </OperatorPanel>

            <OperatorPanel
              className="card system-content-card"
              heading="Public content"
              source="dashboard render"
            >
              <OperatorFacts
                density="compact"
                presentation="reference"
                items={[
                  {
                    label: "Knowledge map",
                    value: (
                      <>
                        <OperatorStatusDot
                          tone={hasKnowledgeMap ? "good" : "warn"}
                        />
                        {hasKnowledgeMap ? "Current" : "Waiting"}
                      </>
                    ),
                  },
                  {
                    label: "Network map",
                    value: (
                      <>
                        <OperatorStatusDot
                          tone={hasNetworkMap ? "good" : "warn"}
                        />
                        {hasNetworkMap ? "Current" : "Waiting"}
                      </>
                    ),
                  },
                  { label: "Public entities", value: input.appInfo.entities },
                ]}
              />
              <OperatorSteps
                label="Public content pipeline"
                items={[
                  { label: "entities", complete: true },
                  { label: "indexed", complete: hasKnowledgeMap },
                  { label: "published", complete: true },
                ]}
              />
            </OperatorPanel>

            <OperatorPanel
              className="card system-checks-card"
              fullWidth
              heading="Public system checks"
              source="this render"
            >
              <OperatorChecks
                label="Public system checks"
                headings={["Operation", "Updated", "Status"]}
                items={[
                  {
                    name: "public-card-render",
                    description: `dashboard · ${input.appInfo.entities} public entities`,
                    updated: "now",
                    status: "current",
                    tone: "good",
                  },
                  {
                    name: "knowledge-map-refresh",
                    description: `topics · ${knowledgeMapZones} public territories`,
                    updated: "this render",
                    status: hasKnowledgeMap ? "current" : "waiting",
                    tone: hasKnowledgeMap ? "good" : "warn",
                  },
                  {
                    name: "agent-proximity-scan",
                    description: `agent-discovery · ${networkCount} public agents`,
                    updated: "this render",
                    status: hasNetworkMap ? "current" : "waiting",
                    tone: hasNetworkMap ? "good" : "warn",
                  },
                ]}
              />
            </OperatorPanel>
          </>
        }
        aside={
          <>
            <OperatorPanel
              className="card system-runtime-card"
              wash="neutral"
              heading="Runtime"
              source="public metadata"
            >
              <OperatorFacts
                density="compact"
                presentation="reference"
                items={[
                  { label: "Version", value: `v${input.appInfo.version}` },
                  {
                    label: "Uptime",
                    value: formatUptime(input.appInfo.uptime),
                  },
                  {
                    label: "Entities",
                    value: `${input.appInfo.entities} public`,
                  },
                  {
                    label: "Surfaces",
                    value: `${onlineCount}/${surfaces.length} online`,
                  },
                  {
                    label: "Rendered",
                    value: (
                      <time dateTime={now.toISOString()}>
                        {formatRendered(now)}
                      </time>
                    ),
                  },
                ]}
              />
            </OperatorPanel>

            <OperatorPanel
              className="card system-surfaces-card"
              heading="Public surfaces"
              source={<>{onlineCount} online</>}
            >
              <OperatorStatusList
                items={surfaces.slice(0, 5).map((surface) => ({
                  id: surface.key,
                  label: surface.label,
                  status:
                    surface.state === "online"
                      ? "Online"
                      : surface.state === "soon"
                        ? "Soon"
                        : "Offline",
                  tone:
                    surface.state === "online"
                      ? "good"
                      : surface.state === "soon"
                        ? "warn"
                        : "error",
                }))}
              />
            </OperatorPanel>

            <OperatorPanel
              className="card system-scope-card"
              wash="good"
              heading="Visibility"
              accessory={
                <OperatorStatusPill className="system-scope-mark" tone="good">
                  Public
                </OperatorStatusPill>
              }
            >
              <OperatorPanelParagraph presentation="note">
                This view reports public service health only. Private memory,
                internal paths, and operator activity remain in Studio.
              </OperatorPanelParagraph>
            </OperatorPanel>
          </>
        }
      />
    </OperatorSection>
  );
}
