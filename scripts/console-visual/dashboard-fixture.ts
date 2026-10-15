import { createMockAppInfo } from "@brains/plugins/test";
import { safeParseRuntimeDashboardWidgetData } from "@brains/plugins";
import type { DashboardRenderInput } from "@brains/dashboard";
import { findCartesianMap } from "../../plugins/dashboard/src/render/public-card-data";

type DashboardWidget = DashboardRenderInput["widgets"][string];

/**
 * What the page needs beyond data: the proximity map's registered component,
 * styles, and script. They load the widget runtime, so the fixture server
 * passes them in and this module stays pure data.
 */
export interface DashboardWidgetRendering {
  proximityComponent: NonNullable<DashboardWidget["component"]>;
  widgetStyles: readonly string[];
  widgetScripts: readonly string[];
}

function dashboardInput(
  rendering: DashboardWidgetRendering,
): DashboardRenderInput {
  return {
    title: "Rover Collective",
    baseUrl: "http://127.0.0.1",
    dashboardPath: "/dashboard",
    askHref: "/ask",
    character: {
      role: "A professional brain for the agentic web",
      purpose: "It captures, connects, and publishes what the network learns.",
      values: ["trust", "clarity", "continuity"],
    },
    profile: {
      name: "Rover Collective",
      description:
        "The shared brain of a cooperative agent network — public by choice, private by default.",
    },
    appInfo: dashboardAppInfo(),
    widgetStyles: [...rendering.widgetStyles],
    widgetScripts: [...rendering.widgetScripts],
    widgets: {
      "agent-discovery:skills": skillsWidget(),
      "topics:topics-knowledge-map": knowledgeMapWidget(),
      "agent-discovery:agent-proximity": agentProximityWidget(
        rendering.proximityComponent,
      ),
    },
    authAccess: {
      loginUrl: "/login",
      logoutUrl: "/logout",
    },
  };
}

/** The public runtime the Dashboard reports: version, holdings, and doors. */
function dashboardAppInfo(): DashboardRenderInput["appInfo"] {
  return createMockAppInfo({
    version: "0.2.0-alpha.317",
    uptime: 37_200,
    entities: 236,
    entityCounts: [
      { entityType: "post", count: 24 },
      { entityType: "note", count: 112 },
      { entityType: "link", count: 86 },
      { entityType: "topic", count: 12 },
      { entityType: "agent", count: 2 },
    ],
    endpoints: [
      {
        label: "Public site",
        url: "https://rover.example",
        pluginId: "webserver",
        priority: 10,
        visibility: "public",
      },
    ],
    interactions: [
      {
        id: "chat",
        label: "Chat",
        description: "Ask about anything held in public scope.",
        href: "/ask",
        kind: "human",
        pluginId: "web-chat",
        priority: 10,
        visibility: "public",
        status: "available",
      },
      {
        id: "a2a",
        label: "Agent API",
        description: "Tools and context for connected agents.",
        href: "/a2a",
        kind: "agent",
        pluginId: "a2a",
        priority: 20,
        visibility: "public",
        status: "available",
      },
    ],
  });
}

/** Public skills, listed in the network sidebar. */
function skillsWidget(): DashboardWidget {
  return {
    widget: {
      id: "skills",
      pluginId: "agent-discovery",
      title: "Skills",
      group: "network",
      section: "sidebar",
      priority: 20,
      rendererName: "DeclarativeOperatorWidget",
      visibility: "public",
    },
    data: {
      view: {
        blocks: [
          {
            type: "list",
            id: "skills",
            empty: "No public skills.",
            items: [
              {
                id: "shared-context",
                title: "Shared context",
                description: "Human–AI collaboration",
              },
              {
                id: "ecosystem-roles",
                title: "Ecosystem roles",
                description: "Cooperative architecture",
              },
              {
                id: "portable-reputation",
                title: "Portable reputation",
                description: "Trust across networks",
              },
            ],
          },
        ],
      },
    },
  };
}

/** A cartesian atlas of public knowledge around seven topic territories. */
function knowledgeMapWidget(): DashboardWidget {
  return {
    widget: {
      id: "topics-knowledge-map",
      pluginId: "topics",
      title: "Knowledge Map",
      group: "knowledge",
      section: "primary",
      priority: 30,
      rendererName: "DeclarativeOperatorWidget",
      visibility: "public",
    },
    data: {
      view: {
        blocks: [
          {
            type: "spatial",
            layout: "cartesian",
            id: "knowledge-map",
            label: "Knowledge map",
            description: "Public knowledge arranged around topic territories.",
            zones: [
              {
                id: "topic:collaboration",
                label: "Human–AI collaboration",
                x: 0.18,
                y: 0.22,
                memberIds: ["post:agents", "skill:context"],
              },
              {
                id: "topic:memory",
                label: "Institutional memory",
                x: 0.42,
                y: 0.18,
                memberIds: ["post:continuity", "note:archives"],
              },
              {
                id: "topic:ecosystems",
                label: "Ecosystem architecture",
                x: 0.62,
                y: 0.36,
                memberIds: ["post:rizom", "skill:roles"],
              },
              {
                id: "topic:trust",
                label: "Trust networks",
                x: 0.78,
                y: 0.2,
                memberIds: ["post:trust", "note:credentials"],
              },
              {
                id: "topic:decentralization",
                label: "Decentralization",
                x: 0.28,
                y: 0.62,
                memberIds: ["post:local-first", "link:protocols"],
              },
              {
                id: "topic:data",
                label: "Data politics",
                x: 0.55,
                y: 0.76,
                memberIds: ["post:data", "note:models"],
              },
              {
                id: "topic:reputation",
                label: "Reputation systems",
                x: 0.84,
                y: 0.66,
                memberIds: ["skill:reputation", "post:portable"],
              },
            ],
            points: [
              {
                id: "post:agents",
                label: "Working with agents",
                category: "published",
                x: 0.12,
                y: 0.3,
                zoneId: "topic:collaboration",
                tone: "good",
              },
              {
                id: "skill:context",
                label: "Shared context",
                category: "skill",
                x: 0.24,
                y: 0.12,
                zoneId: "topic:collaboration",
                tone: "neutral",
              },
              {
                id: "post:continuity",
                label: "Institutional continuity",
                category: "published",
                x: 0.38,
                y: 0.28,
                zoneId: "topic:memory",
                tone: "good",
              },
              {
                id: "note:archives",
                label: "Archive notes",
                category: "high-signal",
                x: 0.48,
                y: 0.1,
                zoneId: "topic:memory",
                tone: "warn",
              },
              {
                id: "post:rizom",
                label: "The rizom model",
                category: "published",
                x: 0.57,
                y: 0.44,
                zoneId: "topic:ecosystems",
                tone: "good",
              },
              {
                id: "skill:roles",
                label: "Ecosystem roles",
                category: "skill",
                x: 0.68,
                y: 0.3,
                zoneId: "topic:ecosystems",
                tone: "neutral",
              },
              {
                id: "post:trust",
                label: "Trust propagation",
                category: "published",
                x: 0.82,
                y: 0.12,
                zoneId: "topic:trust",
                tone: "good",
              },
              {
                id: "note:credentials",
                label: "Credential chains",
                category: "high-signal",
                x: 0.72,
                y: 0.26,
                zoneId: "topic:trust",
                tone: "warn",
              },
              {
                id: "post:local-first",
                label: "Local-first governance",
                category: "published",
                x: 0.2,
                y: 0.7,
                zoneId: "topic:decentralization",
                tone: "good",
              },
              {
                id: "link:protocols",
                label: "Protocol autonomy",
                category: "source",
                x: 0.36,
                y: 0.55,
                zoneId: "topic:decentralization",
                tone: "neutral",
              },
              {
                id: "post:data",
                label: "Big data",
                category: "published",
                x: 0.48,
                y: 0.86,
                zoneId: "topic:data",
                tone: "good",
              },
              {
                id: "note:models",
                label: "Model politics",
                category: "high-signal",
                x: 0.62,
                y: 0.68,
                zoneId: "topic:data",
                tone: "warn",
              },
              {
                id: "skill:reputation",
                label: "Portable reputation",
                category: "skill",
                x: 0.9,
                y: 0.58,
                zoneId: "topic:reputation",
                tone: "neutral",
              },
              {
                id: "post:portable",
                label: "Portable trust",
                category: "published",
                x: 0.78,
                y: 0.76,
                zoneId: "topic:reputation",
                tone: "good",
              },
              {
                id: "link:unfiled",
                label: "Open reference",
                category: "source",
                x: 0.94,
                y: 0.42,
                tone: "neutral",
              },
            ],
            relationships: [
              { sourceId: "topic:collaboration", targetId: "post:agents" },
              { sourceId: "topic:memory", targetId: "post:continuity" },
              { sourceId: "topic:ecosystems", targetId: "post:rizom" },
              { sourceId: "topic:trust", targetId: "post:trust" },
              {
                sourceId: "topic:decentralization",
                targetId: "post:local-first",
              },
              { sourceId: "topic:data", targetId: "post:data" },
              { sourceId: "topic:reputation", targetId: "post:portable" },
            ],
            legend: [
              { label: "Topic zones", tone: "neutral" },
              { label: "Published", tone: "good" },
              { label: "Skills", tone: "neutral" },
              { label: "High signal", tone: "warn" },
            ],
          },
        ],
      },
    },
  };
}

/** Approved agents by semantic distance, drawn by the registered proximity map. */
function agentProximityWidget(
  component: DashboardWidget["component"],
): DashboardWidget {
  return {
    widget: {
      id: "agent-proximity",
      pluginId: "agent-discovery",
      title: "Agent Proximity",
      group: "network",
      section: "primary",
      priority: 35,
      rendererName: "DeclarativeOperatorWidget",
      visibility: "public",
    },
    component,
    data: {
      view: {
        blocks: [
          {
            type: "spatial",
            layout: "radial",
            id: "agent-proximity",
            label: "Agent proximity map",
            description:
              "Approved agents arranged by semantic distance from this brain.",
            centerLabel: "Rover identity",
            centerKind: "identity",
            points: [
              {
                id: "agent:atlas",
                label: "Atlas",
                kind: "collective",
                status: "approved",
                tags: ["governance", "research"],
                distance: 0.32,
                bearing: 42,
                tone: "good",
              },
              {
                id: "agent:moss",
                label: "Moss",
                kind: "person",
                status: "approved",
                tags: ["publishing", "memory"],
                distance: 0.56,
                bearing: 205,
                tone: "good",
              },
            ],
            clusters: [
              {
                id: "cluster:shared-practice",
                label: "Shared practice",
                memberIds: ["agent:atlas", "agent:moss"],
              },
            ],
            relationships: [
              {
                sourceId: "agent:atlas",
                targetId: "agent:moss",
                tone: "good",
              },
            ],
            strata: [
              { id: "near", label: "Near", maxDistance: 0.33 },
              { id: "mid", label: "Mid-range", maxDistance: 0.66 },
              { id: "far", label: "Far", maxDistance: 1 },
            ],
            legend: [
              { label: "Approved agents", tone: "good" },
              { label: "Constellations", tone: "neutral" },
            ],
          },
        ],
      },
      source: {
        center: { kind: "identity" },
        nodes: [
          {
            id: "agent:atlas",
            name: "Atlas",
            kind: "team",
            status: "approved",
            tags: ["governance", "research"],
            distance: 0.32,
            bearing: 42,
          },
          {
            id: "agent:moss",
            name: "Moss",
            kind: "person",
            status: "approved",
            tags: ["publishing", "memory"],
            distance: 0.56,
            bearing: 205,
          },
        ],
        clusters: [
          {
            label: "Shared practice",
            memberIds: ["agent:atlas", "agent:moss"],
            links: [{ sourceId: "agent:atlas", targetId: "agent:moss" }],
          },
        ],
        sightings: [],
        distanceRange: { min: 0.32, max: 0.56 },
        pendingCount: 0,
      },
    },
  };
}

/**
 * The Dashboard input for one `fixture-state` query value: a dense atlas, a
 * declarative network without its registered component, or a waiting brain
 * with no widgets and its chat disabled. Any other value is the default.
 */
export function dashboardFixtureInput(
  fixtureState: string | null,
  rendering: DashboardWidgetRendering,
): DashboardRenderInput {
  const input = dashboardInput(rendering);
  if (fixtureState === "dense-map") {
    const block = findCartesianMap(input.widgets);
    const widget = input.widgets["topics:topics-knowledge-map"];
    if (!block || !widget || block.zones.length === 0)
      throw new Error("Missing source atlas fixture");
    widget.data = {
      view: {
        blocks: [
          {
            ...block,
            zones: Array.from({ length: 20 }, (_, index) => {
              const source = block.zones[index % block.zones.length];
              if (!source) throw new Error("Missing source territory");
              return {
                ...source,
                id:
                  index < block.zones.length
                    ? source.id
                    : `${source.id}:dense-${index}`,
                label: `${source.label} — complete public territory ${index + 1}`,
                x: (index % 5) / 4,
                y: Math.floor(index / 5) / 3,
              };
            }),
          },
        ],
      },
    };
    const parsed = safeParseRuntimeDashboardWidgetData(widget.data);
    if (!parsed.success)
      throw new Error(
        `Invalid dense fixture: ${JSON.stringify(parsed.issues)}`,
      );
  }
  if (fixtureState === "declarative-network") {
    const network = input.widgets["agent-discovery:agent-proximity"];
    if (network) delete network.component;
  }
  if (fixtureState === "waiting") {
    input.widgets = {};
    input.appInfo.interactions = input.appInfo.interactions.map(
      (interaction) =>
        interaction.id === "chat"
          ? { ...interaction, status: "disabled" }
          : interaction,
    );
  }
  return input;
}
