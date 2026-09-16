import { createMockAppInfo } from "@brains/plugins/test";
import { renameChatSessionRequestSchema } from "@brains/contracts/chat";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { getErrorMessage } from "@brains/utils/error";
import { isRecord } from "@brains/utils/is-record";
import path from "node:path";
import { PNG } from "pngjs";
import axe from "axe-core";
import { createAdministrationFixture } from "./fixtures/studio-administration";
import { createWorkViewFixtures } from "./fixtures/studio-work-views";
import { createDeliveryViewFixtures } from "./fixtures/studio-delivery-views";
import { createSyncViewFixture } from "./fixtures/studio-sync-view";
import { systemFixtures } from "./fixtures/studio-system";
import {
  studioStudyStateSchema,
  supportsStudioStudyState,
} from "./fixtures/studio-study-state";
import { createElement, type ReactElement } from "react";
import { renderChatPage } from "@brains/web-chat";
import { renderEditorShellHtml } from "@brains/studio";
import {
  renderDashboardPageHtml,
  type DashboardRenderInput,
} from "@brains/dashboard";
import { safeParseRuntimeDashboardWidgetData } from "@brains/plugins";
import { findCartesianMap } from "../plugins/dashboard/src/render/public-card-data";
import {
  ProximityMap,
  proximityMapScript,
  proximityMapWidgetStyles,
} from "../entities/agent-discovery/src/widgets/proximity-map";
import { proximityMapDataSchema } from "../entities/agent-discovery/src/lib/proximity-map-schema";

const ROOT = path.resolve(import.meta.dir, "..");
const BASELINE_DIR = path.join(ROOT, "test/visual/console/baselines");
const ARTIFACT_DIR = path.join(ROOT, "test/visual/console/artifacts");
const UPDATE = process.argv.includes("--update");
const AUDIT_ACCESSIBILITY = process.argv.includes("--a11y");
const SURFACE_PREFIX = process.argv
  .find((argument) => argument.startsWith("--surface-prefix="))
  ?.slice("--surface-prefix=".length);
const STUDY_STATE = studioStudyStateSchema
  .optional()
  .parse(
    process.argv
      .find((arg) => arg.startsWith("--study-state="))
      ?.slice("--study-state=".length),
  );
const SURFACE_FILTER = process.argv
  .find((argument) => argument.startsWith("--surface="))
  ?.slice("--surface=".length);
if (
  STUDY_STATE &&
  SURFACE_FILTER &&
  !supportsStudioStudyState(SURFACE_FILTER, STUDY_STATE)
)
  throw Error(`Study state ${STUDY_STATE} does not apply to ${SURFACE_FILTER}`);
const VIEWPORT_FILTER = process.argv
  .find((argument) => argument.startsWith("--viewport="))
  ?.slice("--viewport=".length);
const CLIMATE_FILTER = process.argv
  .find((argument) => argument.startsWith("--climate="))
  ?.slice("--climate=".length);
const FIXED_NOW = Date.parse("2026-07-11T16:40:00.000Z");
const VIEWPORTS = [
  { width: 1440, height: 1000 },
  { width: 768, height: 1024 },
  { width: 390, height: 844 },
] as const;
const CLIMATES = ["instrument", "paper"] as const;
const editCapabilities = {
  canRead: true,
  canCreate: true,
  canUpdate: true,
  canDelete: true,
  canExtract: true,
  canPublish: true,
  canAssist: true,
};

const types = [
  {
    entityType: "posts",
    label: "Field notes",
    isSingleton: false,
    hasBody: true,
    count: 54,
    capabilities: editCapabilities,
  },
  {
    entityType: "docs",
    label: "Documentation",
    isSingleton: false,
    hasBody: true,
    count: 7,
    capabilities: editCapabilities,
  },
  {
    entityType: "settings",
    label: "Site settings",
    isSingleton: true,
    hasBody: false,
    count: 1,
    capabilities: editCapabilities,
  },
];
types.push(
  ...[
    {
      entityType: "anchor-profile",
      label: "Anchor Profiles",
      isSingleton: true,
      count: 1,
    },
    {
      entityType: "brain-character",
      label: "Brain Characters",
      isSingleton: true,
      count: 1,
    },
    {
      entityType: "style-guide",
      label: "Style Guides",
      isSingleton: true,
      count: 1,
    },
    { entityType: "prompt", label: "Prompts", isSingleton: false, count: 18 },
    { entityType: "skill", label: "Skills", isSingleton: false, count: 3 },
    { entityType: "agent", label: "Agents", isSingleton: false, count: 15 },
  ].map((info) => ({ ...info, hasBody: true, capabilities: editCapabilities })),
);
const entities = [
  {
    id: "responsive-console",
    entityType: "posts",
    // Published entity so the library pins both publication chip states.
    frontmatter: { title: "A console that travels well", published: true },
    updated: "2026-07-10T10:32:00.000Z",
  },
  {
    id: "field-notes",
    entityType: "posts",
    frontmatter: { title: "Notes from the rhizome" },
    updated: "2026-07-08T17:12:00.000Z",
  },
  {
    id: "release-log",
    entityType: "posts",
    frontmatter: { title: "Alpha release log" },
    updated: "2026-07-03T08:00:00.000Z",
  },
  {
    id: "quiet-infrastructure",
    entityType: "posts",
    frontmatter: { title: "Quiet infrastructure" },
    updated: "2026-06-28T15:24:00.000Z",
  },
];
entities.push(
  ...Array.from({ length: 50 }, (_, index) => ({
    id: `archive-${index + 1}`,
    entityType: "posts",
    frontmatter: { title: `Archive note ${index + 1}` },
    updated: "2026-06-01T12:00:00.000Z",
  })),
);
const entity = {
  ...entities[1],
  // The full colophon the mockups author: slug, select, tags, toggle,
  // schedule, and cover image — every widget the editor renders.
  frontmatter: {
    title: "Notes from the rhizome",
    slug: "field-notes",
    summary: "",
    series: "Trust & Identity",
    topics: ["console", "responsive"],
    published: false,
    publishedAt: "2026-07-14T09:00:00.000Z",
    coverImageId: "image/verdigris-board",
  },
  body: '# Notes from the rhizome\n\nA good console should make dense systems feel calm. Its structure needs to remain legible while the viewport changes around it.\n\n```ts\nconst manuscript = { source: "literal", preview: "rendered" };\nconst scrolling = "independent"; // Preserve source bytes.\nconst pageSize = 25;\n```\n\n| Surface | Reading mode | Records | Keyboard access |\n| --- | --- | ---: | --- |\n| Library | Paged list | 54 | Search, filter, then open |\n| Preview | Markdown | 2 | Scroll code and tables |\n\n> The interface is not a dashboard pasted onto every screen. It is a continuous instrument with distinct working climates.\n\n## Responsive field rules\n\n- Keep shared wayfinding stable.\n- Let local tools adapt to the task.\n- Preserve touch targets and safe areas.\n\nThe result should feel authored at every width.',
  contentHash: "fixture-hash",
  created: "2026-06-18T09:00:00.000Z",
};
let reviewingSystem = false;
let lastSystemSave:
  { frontmatter?: Record<string, unknown>; body?: string } | undefined;
const systemTypes = [...systemFixtures.values()].map((fixture) => ({
  entityType: fixture.entityType,
  label: fixture.label,
  isSingleton: fixture.isSingleton,
  hasBody: fixture.hasBody,
  count: 1,
  capabilities: fixture.readOnly
    ? {
        ...editCapabilities,
        canCreate: false,
        canUpdate: false,
        canDelete: false,
        canAssist: false,
        canPublish: false,
      }
    : editCapabilities,
}));
const sessions = [
  {
    id: "responsive",
    title: "Responsive console audit",
    lastActiveAt: "2026-07-10T12:04:00.000Z",
    contextHandoff: {
      version: 1,
      sourceId: "unified-inbox",
      itemId: "inbox-responsive-audit",
      titleSeed: "Responsive console audit",
    },
  },
  {
    id: "cards",
    title: "Verdigris export review",
    lastActiveAt: "2026-07-10T11:15:00.000Z",
  },
  {
    id: "release",
    title: "Prepare alpha release",
    lastActiveAt: "2026-07-09T16:30:00.000Z",
  },
  {
    id: "studio",
    title: "Revise field notes",
    lastActiveAt: "2026-07-08T09:20:00.000Z",
  },
];
const messages = [
  {
    id: "m1",
    role: "user",
    content:
      "Can you check the responsive console foundation before the next release?",
    // Pins the user upload chip in the top-anchored conversation, where it
    // stays visible at every viewport.
    attachments: [
      {
        kind: "text",
        filename: "verdigris-field-notes.md",
        mediaType: "text/markdown",
        sizeBytes: 4182,
        createdAt: "2026-07-10T11:58:00.000Z",
        source: {
          kind: "upload",
          id: "upload-7c15b6e4-f51d-4df2-8d55-d4b9e730f6aa",
        },
      },
    ],
  },
  {
    id: "m2",
    role: "assistant",
    content:
      "The shared chrome is aligned across the three operator surfaces. Chat keeps the active conversation compact while the session rail reads as a quiet index.\n\nAt narrow widths, the index moves into a drawer and the composer remains inside the safe area.",
  },
  { id: "m3", role: "user", content: "And the Studio?" },
  {
    id: "m4",
    role: "assistant",
    content:
      "The Studio preserves its warm editorial climate. Desktop separates colophon from manuscript; tablet and phone retain Details, Write, and Preview.",
  },
];
// A second, short session pinning the dynamic message states the mockups
// specify: user upload chip, retrieved-source citations, suggested actions,
// and an exported attachment card. Cards render as <details>; the capture
// opens them. Short enough that the whole exchange fits at 1440×1000.
const cardMessages = [
  {
    id: "m5",
    role: "user",
    content: "Pull the verdigris research together for the trust series.",
  },
  {
    id: "m6",
    role: "assistant",
    content:
      "Queued for the trust series. Two notes ground the draft, and the excerpt board below is exported for review.",
    cards: [
      {
        kind: "sources",
        id: "card-sources",
        title: "Grounding notes",
        sources: [
          {
            id: "src-1",
            title: "Verdigris pigments in early print",
            source: "entity",
            entityType: "note",
            entityId: "verdigris-pigments",
            excerpt:
              "The copper acetate greens survive best in dry margins; the trust series should lead with the 1503 plates.",
            provenance: { score: 0.92 },
          },
          {
            id: "src-2",
            title: "Domain as identity",
            source: "entity",
            entityType: "post",
            entityId: "domain-as-identity",
          },
        ],
      },
      {
        kind: "actions",
        id: "card-actions",
        title: "Next moves",
        defaultOpen: true,
        actions: [
          {
            type: "prompt",
            id: "act-1",
            label: "Draft the series opener",
            prompt: "Draft the trust series opener from the verdigris notes.",
            description: "Uses both grounding notes",
          },
          {
            type: "event",
            id: "act-2",
            label: "Queue for export",
            event: "publishing:queue",
          },
        ],
      },
      {
        kind: "attachment",
        id: "card-attachment",
        title: "Verdigris excerpt board",
        description: "Exported preview for the trust series review.",
        attachment: {
          mediaType: "image/png",
          url: "/fixture/verdigris.png",
          previewUrl: "/fixture/verdigris.png",
          filename: "verdigris-board.png",
          sizeBytes: 48213,
          source: { entityType: "note", entityId: "verdigris-pigments" },
        },
      },
    ],
  },
];

function VisualProximityWidget({
  data,
}: {
  data: unknown;
}): ReactElement | null {
  const parsed = proximityMapDataSchema.safeParse(data);
  return parsed.success
    ? createElement(ProximityMap, { data: parsed.data })
    : null;
}

function dashboardInput(): DashboardRenderInput {
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
    appInfo: createMockAppInfo({
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
    }),
    widgetStyles: [proximityMapWidgetStyles],
    widgetScripts: [proximityMapScript],
    widgets: {
      "agent-discovery:skills": {
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
      },
      "topics:topics-knowledge-map": {
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
                description:
                  "Public knowledge arranged around topic territories.",
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
      },
      "agent-discovery:agent-proximity": {
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
        component: VisualProximityWidget,
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
      },
    },
    authAccess: {
      loginUrl: "/login",
      logoutUrl: "/logout",
    },
  };
}

function climateHtml(html: string, request: Request): string {
  const climate = new URL(request.url).searchParams.get("climate");
  return climate === "paper" || climate === "instrument"
    ? html.replace(
        /data-climate="(?:paper|instrument)"/,
        `data-climate="${climate}"`,
      )
    : html;
}

function json(value: unknown): Response {
  return Response.json(value);
}

interface BrowserNetworkEvent {
  requestId: string;
}

async function evaluatePage<T>(
  page: Bun.WebView,
  operation: () => T | Promise<T>,
): Promise<Awaited<T>> {
  return page.evaluate<Awaited<T>>(`(${operation.toString()})()`);
}

async function evaluatePageWith<TArg, TResult>(
  page: Bun.WebView,
  operation: (arg: TArg) => TResult | Promise<TResult>,
  arg: TArg,
): Promise<Awaited<TResult>> {
  const serialized = JSON.stringify(arg);
  return page.evaluate<Awaited<TResult>>(
    `(${operation.toString()})(${serialized})`,
  );
}

async function waitForPage(
  description: string,
  probe: () => Promise<boolean>,
  timeoutMs = 30_000,
): Promise<void> {
  const deadline = performance.now() + timeoutMs;
  while (performance.now() < deadline) {
    if (await probe()) return;
    await Bun.sleep(20);
  }
  throw new Error(`Timed out waiting for ${description}`);
}

async function waitForSelector(
  page: Bun.WebView,
  selector: string,
): Promise<void> {
  await waitForPage(selector, () =>
    page.evaluate<boolean>(
      `document.querySelector(${JSON.stringify(selector)}) !== null`,
    ),
  );
}

async function verifyAdministrationRecords(
  page: Bun.WebView,
  surface: string,
): Promise<void> {
  const label =
    surface === "studio-administration"
      ? "View protection"
      : surface === "studio-administration-invitations"
        ? "Review"
        : "Details";
  await waitForSelector(
    page,
    '.declarative-detail-master [data-record-trailing="true"]',
  );
  await clickText(
    page,
    '.declarative-detail-master [data-record-trailing="true"] button',
    label,
  );
  await waitForSelector(page, ".declarative-detail-pane h2");
  const inspection = await evaluatePage(page, () => {
    const pane = document.querySelector(".declarative-detail-pane");
    return {
      selected: new URL(location.href).searchParams.has("selected"),
      text: pane?.textContent ?? "",
      unsafeAnchorControl: Array.from(
        pane?.querySelectorAll("button") ?? [],
      ).some(
        (button) =>
          /^(Change role|Suspend person)$/.test(button.textContent.trim()) &&
          !button.disabled,
      ),
    };
  });
  if (!inspection.selected)
    throw new Error(
      "Administration selection did not enter canonical query state",
    );
  if (
    surface === "studio-administration" &&
    (!inspection.text.includes("must remain an active Admin") ||
      !inspection.text.includes("cannot be suspended") ||
      inspection.unsafeAnchorControl)
  )
    throw new Error("Anchor inspection lost its protection");
  if (
    surface === "studio-administration-invitations" &&
    !inspection.text.includes("Confirm delivered")
  )
    throw new Error("Invitation review lost its manual delivery control");
  if ((await elementDisplay(page, ".declarative-detail-back")) !== "none") {
    await clickText(page, ".declarative-detail-back", "Back");
  } else {
    // Query edits replace the current URL; desktop inspection returns through
    // the local tabs rather than pretending browser Back closes the pane.
    const next = surface === "studio-administration" ? "Invitations" : "People";
    await activateWorkspaceTab(page, next);
    await waitForPage("Administration local tab transition", () =>
      evaluatePageWith(
        page,
        (label) =>
          document
            .querySelector('[role="tab"][aria-selected="true"]')
            ?.textContent.trim() === label &&
          !document.querySelector(".declarative-detail-pane"),
        next,
      ),
    );
    await activateWorkspaceTab(
      page,
      surface === "studio-administration"
        ? "People"
        : surface === "studio-administration-invitations"
          ? "Invitations"
          : "Audit",
    );
  }
  await waitForPage("Administration collection after closing inspection", () =>
    evaluatePage(
      page,
      () =>
        !!document.querySelector(".declarative-detail-master") &&
        !document.querySelector(".declarative-detail-pane"),
    ),
  );
}

async function verifyMapMotion(page: Bun.WebView): Promise<void> {
  await page.cdp("Emulation.setEmulatedMedia", {
    features: [{ name: "prefers-reduced-motion", value: "no-preference" }],
  });
  try {
    await evaluatePage(page, () => {
      const marks = document.querySelectorAll(
        ".knowledge-weave,.knowledge-zone-contour,.knowledge-point,.proximity-spore,.proximity-center-halo,.proximity-node-glow",
      );
      if (marks.length < 5) throw Error("Missing animated map marks");
      for (const mark of marks)
        if (getComputedStyle(mark).animationName === "none")
          throw Error("Map lost its compiled animation");
    });
    await page.cdp("Emulation.setEmulatedMedia", {
      features: [{ name: "prefers-reduced-motion", value: "reduce" }],
    });
    await evaluatePage(page, () => {
      if (!matchMedia("(prefers-reduced-motion: reduce)").matches)
        throw Error("Reduced-motion emulation failed");
      const marks = document.querySelectorAll(
        ".knowledge-weave,.knowledge-zone-contour,.knowledge-point,.proximity-spore,.proximity-center-halo,.proximity-node-glow",
      );
      for (const mark of marks) {
        const style = getComputedStyle(mark);
        if (
          style.animationName !== "none" ||
          Number.parseFloat(style.opacity) !== 1 ||
          style.transform !== "none"
        )
          throw Error("Reduced-motion map marks are animated or hidden");
      }
      for (const path of document.querySelectorAll(
        ".knowledge-weave,.knowledge-zone-contour",
      ))
        if (Number.parseFloat(getComputedStyle(path).strokeDashoffset) !== 0)
          throw Error("Reduced-motion contours did not finish drawing");
    });
  } finally {
    await page.cdp("Emulation.setEmulatedMedia", { features: [] });
  }
  await Bun.sleep(1200);
}

async function verifyDashboardChrome(page: Bun.WebView): Promise<void> {
  await waitForPage("Dashboard tabs initialized", () =>
    evaluatePage(page, () =>
      document.documentElement.classList.contains("dashboard-tabs-ready"),
    ),
  );
  await evaluatePage(page, () => {
    const paper = document.documentElement.dataset["climate"] === "paper";
    const bodyStyle = getComputedStyle(document.body),
      grain = getComputedStyle(document.body, "::before"),
      vignette = getComputedStyle(document.body, "::after");
    if (
      bodyStyle.fontSize !== "14px" ||
      bodyStyle.lineHeight !== "21px" ||
      bodyStyle.overflowX !== "clip" ||
      grain.opacity !== (paper ? "0.06" : "0.035") ||
      grain.mixBlendMode !== (paper ? "multiply" : "overlay") ||
      vignette.opacity !== (paper ? "0.7" : "0.55") ||
      !grain.backgroundImage.includes("feTurbulence") ||
      !vignette.backgroundImage.includes("radial-gradient") ||
      (paper && !vignette.backgroundImage.includes("-10%"))
    )
      throw Error("Compiled document foundation lost its climate treatment");
    for (const overlay of [grain, vignette])
      if (
        overlay.position !== "fixed" ||
        overlay.pointerEvents !== "none" ||
        overlay.zIndex !== "0"
      )
        throw Error(
          "Document ambience intercepts or overlays content incorrectly",
        );
    const header = document.querySelector(".public-header");
    if (
      !header ||
      header.querySelector("a")?.getAttribute("href") !== "/dashboard"
    )
      throw new Error("Dashboard lost its home link");
    if (
      header.querySelector(".public-header-ask")?.getAttribute("href") !==
        "/ask" ||
      header.querySelector(".public-header-sign-in")?.getAttribute("href") !==
        "/login"
    )
      throw new Error("Dashboard changed its guest or sign-in destinations");
    if (window.innerWidth <= 640) {
      for (const link of header.querySelectorAll("a"))
        if (link.getBoundingClientRect().height < 44)
          throw new Error("Public header lost a phone touch target");
      const description = document.querySelector(".masthead p");
      if (!description || getComputedStyle(description).paddingBottom !== "0px")
        throw new Error("Phone masthead retained desktop description spacing");
    }
    const frame = document.querySelector<HTMLElement>(".frame");
    const canvas = document.querySelector(".canvas");
    const sections = document.querySelector(".dashboard-tab-panels");
    const footer = document.querySelector(".colophon");
    if (!frame || !canvas || !sections || !footer)
      throw new Error("Missing shared Dashboard framing");
    const phone = window.innerWidth <= 640;
    const frameStyle = getComputedStyle(frame);
    if (
      Math.abs(
        frame.getBoundingClientRect().width -
          Math.min(1280, window.innerWidth * 0.96),
      ) > 1 ||
      frameStyle.borderLeftWidth !== (phone ? "0px" : "1px") ||
      getComputedStyle(canvas).paddingLeft !== (phone ? "14px" : "26px") ||
      getComputedStyle(sections).gap !== (phone ? "24px" : "42px") ||
      getComputedStyle(footer).marginTop !== "32px"
    )
      throw new Error("Compiled frame changed its responsive geometry");
    if (phone) {
      if (frameStyle.boxShadow !== "none")
        throw new Error("Phone frame retained a desktop shadow");
      for (const link of footer.querySelectorAll("a"))
        if (link.getBoundingClientRect().height < 44)
          throw new Error("Footer lost a phone touch target");
    }
    if (!phone) {
      const expectedShadowOffset =
        document.documentElement.getAttribute("data-climate") === "paper"
          ? "22px"
          : "30px";
      if (!frameStyle.boxShadow.includes(expectedShadowOffset))
        throw new Error("Frame lost its climate shadow");
    }
    const cards = [...document.querySelectorAll<HTMLElement>(".card")];
    if (cards.length < 13) throw new Error("Missing public Dashboard panels");
    for (const card of cards) {
      const style = getComputedStyle(card);
      const edgeAligned = card.classList.contains("system-health-card");
      const tight = card.classList.contains("map-card");
      const bottom = edgeAligned
        ? "0px"
        : phone
          ? tight
            ? "12px"
            : "14px"
          : "16px";
      const left = edgeAligned || !phone ? "18px" : tight ? "12px" : "14px";
      const heading = card.querySelector(":scope > header");
      if (
        style.borderTopWidth !== "1px" ||
        style.paddingBottom !== bottom ||
        style.paddingLeft !== left ||
        style.containerType !== "inline-size" ||
        style.containerName !== "operator-panel" ||
        !heading ||
        getComputedStyle(heading).marginBottom !== (phone ? "10px" : "12px") ||
        card.scrollWidth > card.clientWidth + 1
      )
        throw new Error(
          "Compiled panel changed its inset, heading, containment, or bounds",
        );
    }
    const sectionHead = document.querySelector("#knowledge > header");
    const activeSection = frame.getAttribute("data-ui-tabs-active");
    if (
      !sectionHead ||
      activeSection === null ||
      getComputedStyle(sectionHead).display !== "none"
    )
      throw new Error("Enhanced sections retained duplicate headings");
    frame.removeAttribute("data-ui-tabs-active");
    try {
      if (getComputedStyle(sectionHead).display === "none")
        throw new Error("Unenhanced sections lost their native headings");
    } finally {
      frame.setAttribute("data-ui-tabs-active", activeSection);
    }
    const climate = header.querySelector<HTMLButtonElement>("#climateToggle");
    if (!climate) throw new Error("Missing climate control");
    if (getComputedStyle(climate).display !== "none") {
      const before = document.documentElement.getAttribute("data-climate");
      climate.click();
      if (document.documentElement.getAttribute("data-climate") === before)
        throw new Error("Climate control no longer toggles");
      climate.click();
      if (document.documentElement.getAttribute("data-climate") !== before)
        throw new Error("Climate control did not restore the selected climate");
    }
    const overview = document.querySelector<HTMLElement>(
      '[data-dashboard-tab-link="overview"]',
    );
    const knowledge = document.querySelector<HTMLElement>(
      '[data-dashboard-tab-link="knowledge"]',
    );
    if (!overview || !knowledge)
      throw new Error("Missing Dashboard section links");
    const previousHash = window.location.hash;
    overview.focus();
    overview.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }),
    );
    const overviewPanel = document.getElementById("overview");
    if (
      document.activeElement !== knowledge ||
      knowledge.getAttribute("aria-selected") !== "true" ||
      window.location.hash !== "#knowledge" ||
      document.getElementById("knowledge")?.hasAttribute("hidden") ||
      !overviewPanel ||
      getComputedStyle(overviewPanel).display !== "none"
    )
      throw new Error(
        "Dashboard keyboard tabs lost state, focus, or hash navigation",
      );
    const selected = getComputedStyle(knowledge),
      other = getComputedStyle(overview);
    if (
      selected.borderBottomWidth !== "2px" ||
      selected.borderBottomColor === other.borderBottomColor
    )
      throw new Error(
        `Compiled tabs did not reflect selected ARIA state: ${selected.borderBottomWidth}, ${selected.borderBottomColor} / ${other.borderBottomColor}`,
      );
    const atlas = document.querySelector<HTMLElement>(".knowledge-map-field");
    const atlasCanvas = atlas?.querySelector<HTMLElement>(
      ".knowledge-map-canvas",
    );
    const atlasGraphic = atlasCanvas?.querySelector("svg");
    const atlasSummary = document.querySelector<HTMLElement>(
      ".knowledge-atlas-summary",
    );
    if (!atlas || !atlasCanvas || !atlasGraphic || !atlasSummary)
      throw new Error("Missing shared map framing");
    const phoneMap = window.innerWidth <= 700;
    if (
      getComputedStyle(atlas).gridTemplateColumns.split(" ").length !==
        (phoneMap ? 1 : 2) ||
      getComputedStyle(atlasGraphic).minHeight !==
        (phoneMap ? "320px" : "480px") ||
      Math.abs(
        atlasGraphic.getBoundingClientRect().width / atlasCanvas.clientWidth -
          (phoneMap ? 1.4 : 1),
      ) > 0.01
    )
      throw new Error("Map framing lost its responsive projection geometry");
    const paperMap =
      document.documentElement.getAttribute("data-climate") === "paper";
    if (
      !getComputedStyle(atlas).boxShadow.includes(
        paperMap ? "90, 60, 20" : "0, 0, 0",
      )
    )
      throw new Error("Map inset shadow lost its climate");
    const values = atlasSummary.querySelectorAll("dd strong");
    const labels = atlasSummary.querySelectorAll("dt");
    if (
      values.length !== 3 ||
      labels.length !== 3 ||
      !values[0] ||
      !labels[0] ||
      getComputedStyle(values[0]).fontSize !== (phoneMap ? "20px" : "23px") ||
      getComputedStyle(labels[0]).fontSize !== (phoneMap ? "6.5px" : "8px")
    )
      throw new Error("Map summary lost its numeric hierarchy");
    const mapStatus = atlasSummary.querySelector("p");
    if (!mapStatus) throw new Error("Missing map summary status");
    const originalStatusChildren = Array.from(mapStatus.childNodes);
    const originalValue = values[0].textContent;
    try {
      mapStatus.textContent = "long-source-status".repeat(20);
      values[0].textContent = "1234567890".repeat(30);
      if (atlasSummary.scrollWidth > atlasSummary.clientWidth + 1)
        throw new Error("Long map summary data escaped its frame");
    } finally {
      mapStatus.replaceChildren(...originalStatusChildren);
      values[0].textContent = originalValue;
    }
    const territoryControls = atlas.querySelectorAll<HTMLButtonElement>(
      "[data-knowledge-zone-ref]",
    );
    const firstTerritory = territoryControls[0],
      secondTerritory = territoryControls[1];
    if (!firstTerritory || !secondTerritory)
      throw new Error("Missing source territory controls");
    for (const control of territoryControls) {
      if (
        control.classList.contains("is-active") ||
        (phoneMap && control.getBoundingClientRect().height < 44)
      )
        throw new Error(
          "Territory controls lost native-state styling or phone targets",
        );
    }
    const selectedTerritoryBackground =
      getComputedStyle(firstTerritory).backgroundColor;
    secondTerritory.focus();
    if (
      getComputedStyle(secondTerritory).backgroundColor !==
        selectedTerritoryBackground ||
      getComputedStyle(firstTerritory).backgroundColor ===
        selectedTerritoryBackground
    )
      throw new Error("Territory selection did not follow ARIA state");
    const activeZone = atlas.querySelector(
      '.knowledge-zone[data-map-active="true"]',
    );
    if (!activeZone) throw new Error("Missing selected region");
    if (
      secondTerritory.getAttribute("aria-pressed") !== "true" ||
      activeZone.getAttribute("data-knowledge-zone") !==
        secondTerritory.getAttribute("data-knowledge-zone-ref")
    )
      throw new Error("Map focus no longer traces its source territory");
    const activeContours = activeZone.querySelectorAll(
      ".knowledge-zone-contour",
    );
    const inactiveContours = atlas.querySelectorAll(
      '.knowledge-zone[data-map-active="false"] .knowledge-zone-contour',
    );
    if (
      activeContours.length !== 3 ||
      inactiveContours.length < 3 ||
      Array.from(activeContours).some(
        (path) =>
          Number.parseFloat(getComputedStyle(path).strokeOpacity) !== 0.58,
      ) ||
      Array.from(inactiveContours).some(
        (path, index) =>
          getComputedStyle(path).strokeOpacity !==
          ["0.23", "0.34", "0.22"][index % 3],
      )
    )
      throw new Error("Region paint no longer follows explicit map selection");
    knowledge.focus();
    const indexNote = atlas.querySelector("[data-map-index-note]");
    const indexList = atlas.querySelector("ol");
    if (
      !indexNote ||
      !indexList ||
      (!phoneMap &&
        (getComputedStyle(indexNote).position === "absolute" ||
          indexNote.getBoundingClientRect().top <
            indexList.getBoundingClientRect().bottom - 1))
    )
      throw new Error("Territory guidance overlaps its source records");
    const markers = document.querySelectorAll("#knowledge [data-map-marker]");
    if (markers.length === 0) throw new Error("Missing compiled map legend");
    for (const marker of markers) {
      const dot = marker.querySelector("i");
      if (!dot) throw new Error("Missing legend marker");
      if (
        dot.getAttribute("aria-hidden") !== "true" ||
        getComputedStyle(dot).width !== "8px"
      )
        throw new Error("Legend marker lost its compiled shape");
      if (
        marker.getAttribute("data-map-marker") === "dashed-ring" &&
        getComputedStyle(dot).borderTopStyle !== "dashed"
      )
        throw new Error("Legend lost its explicit grouping marker");
    }
    if (firstTerritory.getAttribute("aria-pressed") !== "true")
      throw new Error("Map focus exit did not restore the leading territory");
    const networkTab = document.querySelector<HTMLElement>(
      '[data-ui-tab="network"]',
    );
    if (!networkTab) throw new Error("Missing Network section");
    networkTab.click();
    const field = document.querySelector(".proximity-field");
    const plot = field?.querySelector(":scope > svg");
    if (!field || !plot)
      throw new Error("Missing registered proximity visualization");
    const fieldWidth = field.getBoundingClientRect().width;
    const expectedPlotWidth = fieldWidth * (fieldWidth <= 700 ? 1.26 : 1);
    if (Math.abs(plot.getBoundingClientRect().width - expectedPlotWidth) > 1)
      throw new Error(
        "Registered visualization lost its shared panel container query",
      );
    const systemTab = document.querySelector<HTMLElement>(
      '[data-ui-tab="system"]',
    );
    const systemPanel = document.getElementById("system");
    if (!systemTab || !systemPanel) throw new Error("Missing System section");
    systemTab.click();
    if (
      systemPanel.hasAttribute("hidden") ||
      systemTab.getAttribute("aria-selected") !== "true"
    )
      throw new Error("System section did not activate");
    for (const card of systemPanel.querySelectorAll<HTMLElement>(".card")) {
      if (
        card.getBoundingClientRect().height <= 0 ||
        card.scrollWidth > card.clientWidth + 1
      )
        throw new Error("System panel content is hidden or overflowing");
    }
    const columns = systemPanel.querySelector(
      '[data-columns-presentation="panels"]',
    );
    const primaryColumns = columns?.firstElementChild;
    const supporting = columns?.querySelector(":scope > aside");
    if (
      !columns ||
      !primaryColumns ||
      !supporting ||
      getComputedStyle(columns).gap !== "14px" ||
      getComputedStyle(columns).gridTemplateColumns.split(" ").length !==
        (window.innerWidth <= 960 ? 1 : 2) ||
      getComputedStyle(primaryColumns).gridTemplateColumns.split(" ").length !==
        (window.innerWidth <= 700 ? 1 : 2) ||
      getComputedStyle(supporting).display !==
        (window.innerWidth <= 960 ? "grid" : "flex")
    )
      throw new Error(
        "System lost its responsive primary/supporting panel layout",
      );
    if (
      window.innerWidth <= 960 &&
      getComputedStyle(supporting).gridTemplateColumns.split(" ").length !==
        (window.innerWidth <= 700 ? 1 : 3)
    )
      throw new Error("Supporting panels lost their tablet/phone columns");
    for (const card of systemPanel.querySelectorAll(
      ".system-health-card,.system-checks-card",
    ))
      if (
        Math.abs(
          card.getBoundingClientRect().width -
            primaryColumns.getBoundingClientRect().width,
        ) > 1
      )
        throw new Error("A spanning System panel lost the full primary width");
    const summary = systemPanel.querySelector("[data-status-summary]");
    const band = systemPanel.querySelector('[data-stats-presentation="band"]');
    const readiness = systemPanel.querySelector(
      '[data-readiness-tone] [role="img"]',
    );
    const checks = systemPanel.querySelector("table");
    if (!summary || !band || !readiness || !checks)
      throw new Error("Missing compiled System content");
    const firstMetric = band.firstElementChild;
    if (!firstMetric) throw new Error("Missing snapshot metrics");
    if (
      getComputedStyle(band).gridTemplateColumns.split(" ").length !==
        (window.innerWidth <= 700 ? 1 : 3) ||
      getComputedStyle(firstMetric).borderTopWidth !== "0px" ||
      getComputedStyle(readiness).width !==
        (window.innerWidth <= 420 ? "68px" : "78px")
    )
      throw new Error(
        "Snapshot band or readiness indicator lost its responsive geometry",
      );
    if (
      checks.querySelectorAll('thead th[scope="col"]').length !== 3 ||
      checks.querySelectorAll('tbody th[scope="row"]').length !== 3
    )
      throw new Error("System checks lost their semantic headers");
    for (const updated of checks.querySelectorAll("tbody td:first-of-type"))
      if (
        getComputedStyle(updated).display === "none" ||
        updated.getBoundingClientRect().height < 1
      )
        throw new Error(
          "System check update metadata became unavailable on phones",
        );
    const operation = checks.querySelector("tbody strong"),
      diagnostic = checks.querySelector("tbody small"),
      status = checks.querySelector("tbody td:last-child span");
    const checkPanel = systemPanel.querySelector<HTMLElement>(
      ".system-checks-card",
    );
    if (!operation || !diagnostic || !status || !checkPanel)
      throw new Error("Missing check records");
    const copy = [
      operation.textContent,
      diagnostic.textContent,
      status.textContent,
    ];
    try {
      operation.textContent = "exact-operation-identifier".repeat(24);
      diagnostic.textContent = "Full diagnostic without truncation. ".repeat(
        24,
      );
      status.textContent = "long-status-token".repeat(24);
      if (checkPanel.scrollWidth > checkPanel.clientWidth + 1)
        throw new Error("Long check metadata escaped its panel");
    } finally {
      operation.textContent = copy[0] ?? "";
      diagnostic.textContent = copy[1] ?? "";
      status.textContent = copy[2] ?? "";
    }
    const facts = systemPanel.querySelectorAll(
      '[data-facts-presentation="reference"]',
    );
    if (facts.length !== 2) throw new Error("Missing public reference facts");
    for (const row of systemPanel.querySelectorAll(
      '[data-facts-presentation="reference"] > div',
    )) {
      const label = row.querySelector("dt"),
        value = row.querySelector("dd");
      if (
        !label ||
        !value ||
        getComputedStyle(row).paddingTop !== "8px" ||
        getComputedStyle(label).fontSize !== "9.5px" ||
        getComputedStyle(value).fontSize !== "10.5px"
      )
        throw new Error("Reference facts lost their compiled row hierarchy");
    }
    const version = systemPanel.querySelector(".system-runtime-card dd");
    const runtime = systemPanel.querySelector<HTMLElement>(
      ".system-runtime-card",
    );
    if (!version || !runtime)
      throw new Error("Missing public runtime metadata");
    const versionText = version.textContent;
    try {
      version.textContent = "long-version-token".repeat(40);
      if (runtime.scrollWidth > runtime.clientWidth + 1)
        throw new Error("Long public metadata escaped its panel");
    } finally {
      version.textContent = versionText;
    }
    if (
      !systemPanel.querySelector("time[datetime]") ||
      !systemPanel.querySelector("header > .system-scope-mark")
    )
      throw new Error(
        "System lost its exact timestamp or direct public-scope accessory",
      );
    systemTab.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Home", bubbles: true }),
    );
    if (
      document.activeElement !== overview ||
      overview.getAttribute("aria-selected") !== "true"
    )
      throw new Error("Dashboard Home key did not restore Overview");
    overview.blur();
    for (
      let node: HTMLElement | null = overview;
      node;
      node = node.parentElement
    ) {
      node.scrollTop = 0;
      node.scrollLeft = 0;
    }
    window.history.replaceState(
      null,
      "",
      window.location.pathname + window.location.search + previousHash,
    );
  });
}

async function verifyDashboardSummary(page: Bun.WebView): Promise<void> {
  const target = await evaluatePage(page, () => {
    const phone = window.innerWidth <= 640;
    const paragraph = document.querySelector(".public-identity-card p");
    const ledger = document.querySelector(
      '.public-holdings-card [data-stats-presentation="ledger"]',
    );
    const links = [
      ...document.querySelectorAll<HTMLAnchorElement>(
        ".public-contact-card li > a",
      ),
    ];
    const link = links[0];
    if (!paragraph || !ledger || !link || links.length !== 3)
      throw new Error(
        "Overview lost its public copy, totals, or contact sources",
      );
    if (
      getComputedStyle(paragraph).fontSize !== (phone ? "13px" : "14px") ||
      getComputedStyle(ledger).gridTemplateColumns.split(" ").length !==
        (phone ? 2 : 4)
    )
      throw new Error(
        "Compiled overview copy or totals changed their responsive hierarchy",
      );
    const values = [...ledger.querySelectorAll("dd")];
    if (
      values.length !== 4 ||
      values.some(
        (value) =>
          getComputedStyle(value).fontSize !== (phone ? "25px" : "28px"),
      )
    )
      throw new Error("Overview lost its four source-supplied totals");
    for (const item of links) {
      if (phone && item.getBoundingClientRect().height < 44)
        throw new Error("A public contact link lost its phone touch target");
    }
    const skills = document.querySelectorAll(
      '.public-skills-card li[data-tone="good"]',
    );
    if (
      skills.length !== 3 ||
      [...skills].some(
        (row) =>
          row.querySelector("a") !== null ||
          row.querySelector('[aria-hidden="true"]') === null,
      )
    )
      throw new Error(
        "Skill summaries changed into links or lost their positive marker",
      );
    const longLabel = link.querySelector("strong");
    const longBadge = link.querySelector("small");
    if (!longLabel || !longBadge)
      throw new Error("Missing summary copy or badge");
    const labelText = longLabel.textContent,
      badgeText = longBadge.textContent;
    try {
      longLabel.textContent = "unbroken-summary-label".repeat(40);
      longBadge.textContent = "unbroken-badge".repeat(40);
      if (link.scrollWidth > link.clientWidth + 1)
        throw new Error("Long authored summary copy overflowed its link");
    } finally {
      longLabel.textContent = labelText;
      longBadge.textContent = badgeText;
    }
    link.scrollIntoView({ block: "center" });
    link.focus();
    if (
      !link.matches(":focus-visible") ||
      getComputedStyle(link).outlineWidth !== "2px"
    )
      throw new Error("Public contact keyboard focus is not visible");
    link.blur();
    const rect = link.getBoundingClientRect();
    return {
      x: rect.x + rect.width / 2,
      y: rect.y + rect.height / 2,
      href: link.getAttribute("href"),
    };
  });
  await page.cdp("Input.dispatchMouseEvent", {
    type: "mouseMoved",
    x: target.x,
    y: target.y,
  });
  try {
    await waitForPage("Summary link hover transition", () =>
      evaluatePage(page, () => {
        const label = document.querySelector(
          ".public-contact-card li > a strong",
        );
        const primary = document.querySelector(".public-header-ask");
        return (
          !!label &&
          !!primary &&
          getComputedStyle(label).color ===
            getComputedStyle(primary).backgroundColor
        );
      }),
    );
    await evaluatePageWith(
      page,
      (href) => {
        const link = document.querySelector(".public-contact-card li > a");
        const label = link?.querySelector("strong");
        const primary = document.querySelector(".public-header-ask");
        if (
          !link ||
          !label ||
          !primary ||
          !link.matches(":hover") ||
          getComputedStyle(label).color !==
            getComputedStyle(primary).backgroundColor ||
          link.getAttribute("href") !== href
        )
          throw new Error(
            `Compiled summary hover: hovered=${link?.matches(":hover")}, color=${label ? getComputedStyle(label).color : "missing"}, accent=${primary ? getComputedStyle(primary).backgroundColor : "missing"}, destination=${link?.getAttribute("href") === href}`,
          );
      },
      target.href,
    );
  } finally {
    await page.cdp("Input.dispatchMouseEvent", {
      type: "mouseMoved",
      x: 0,
      y: 0,
    });
    await evaluatePage(page, () => {
      window.scrollTo(0, 0);
    });
    await waitForPage("Summary hover cleared", () =>
      evaluatePage(page, () => {
        const label = document.querySelector(
          ".public-contact-card li > a strong",
        );
        const unlinked = document.querySelector(".public-skills-card strong");
        return (
          !!label &&
          !!unlinked &&
          getComputedStyle(label).color === getComputedStyle(unlinked).color
        );
      }),
    );
  }
}

async function verifyRecordTypography(page: Bun.WebView): Promise<void> {
  const failures = await evaluatePage(page, () => {
    const errors: string[] = [];
    const root = getComputedStyle(document.documentElement);
    const normalize = (value: string): string => value.replace(/["'\s]/g, "");
    for (const list of document.querySelectorAll<HTMLElement>(
      ".operator-list[data-presentation]",
    )) {
      const role = list.dataset["presentation"];
      const size =
        role === "editorial"
          ? 20
          : role === "attention"
            ? 18
            : role === "activity"
              ? 14
              : 16;
      const family = normalize(
        root.getPropertyValue(
          role === "editorial" ? "--console-display" : "--console-ui",
        ),
      );
      for (const title of list.querySelectorAll<HTMLElement>(
        ":scope > li > div:first-child > strong",
      )) {
        const style = getComputedStyle(title);
        if (
          style.fontSize !== `${size}px` ||
          normalize(style.fontFamily) !== family
        )
          errors.push(`${role}: ${style.fontSize} ${style.fontFamily}`);
        const link = title.querySelector("a,button");
        if (link && getComputedStyle(link).fontSize !== style.fontSize)
          errors.push(`${role}: linked title lost its typography`);
      }
    }
    return errors;
  });
  if (failures.length)
    throw new Error(`Record hierarchy mismatch: ${failures.join("; ")}`);
}

async function waitForText(page: Bun.WebView, text: string): Promise<void> {
  await waitForPage(`text ${JSON.stringify(text)}`, () =>
    page.evaluate<boolean>(
      `document.body?.textContent?.includes(${JSON.stringify(text)}) ?? false`,
    ),
  );
}

async function clickSelector(
  page: Bun.WebView,
  selector: string,
): Promise<void> {
  await waitForSelector(page, selector);
  const clicked = await evaluatePageWith(
    page,
    (candidateSelector) => {
      const candidate = document.querySelector(candidateSelector);
      if (!(candidate instanceof HTMLElement)) return false;
      candidate.click();
      return true;
    },
    selector,
  );
  if (!clicked) throw new Error(`Could not click ${selector}`);
}

async function pointerDownSelector(
  page: Bun.WebView,
  selector: string,
): Promise<void> {
  await waitForSelector(page, selector);
  const dispatched = await evaluatePageWith(
    page,
    (candidateSelector) => {
      const candidate = document.querySelector(candidateSelector);
      if (!(candidate instanceof HTMLElement)) return false;
      candidate.dispatchEvent(
        new PointerEvent("pointerdown", {
          bubbles: true,
          button: 0,
          pointerType: "mouse",
        }),
      );
      return true;
    },
    selector,
  );
  if (!dispatched) throw new Error(`Could not press ${selector}`);
}

async function clickText(
  page: Bun.WebView,
  selector: string,
  text: string,
): Promise<void> {
  const clicked = await evaluatePageWith(
    page,
    ({ selector: candidateSelector, text: candidateText }) => {
      const candidate = Array.from(
        document.querySelectorAll<HTMLElement>(candidateSelector),
      ).find((element) => element.textContent.trim().includes(candidateText));
      candidate?.click();
      return candidate !== undefined;
    },
    { selector, text },
  );
  if (!clicked)
    throw new Error(`Could not find ${selector} containing ${text}`);
}

async function activateWorkspaceTab(
  page: Bun.WebView,
  label: string,
): Promise<void> {
  const position = await evaluatePageWith(
    page,
    (text) => {
      const tab = Array.from(
        document.querySelectorAll<HTMLElement>('[role="tab"]'),
      ).find((node) => node.textContent.trim() === text);
      if (!tab) return null;
      const rect = tab.getBoundingClientRect();
      return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
    },
    label,
  );
  if (!position) throw new Error(`Missing workspace tab: ${label}`);
  await page.cdp("Input.dispatchMouseEvent", {
    type: "mousePressed",
    ...position,
    button: "left",
    clickCount: 1,
  });
  await page.cdp("Input.dispatchMouseEvent", {
    type: "mouseReleased",
    ...position,
    button: "left",
    clickCount: 1,
  });
}

async function verifyStudioMobileSwitcher(page: Bun.WebView): Promise<void> {
  const originalPath = await page.evaluate<string>("location.pathname");
  await clickSelector(page, ".studio-mobile-switcher");
  await waitForSelector(page, ".studio-mobile-navigation-sheet");
  const expanded = await page.evaluate<boolean>(
    'document.querySelector(".studio-mobile-switcher")?.getAttribute("aria-expanded") === "true"',
  );
  if (!expanded) throw new Error("Studio phone context picker did not open");
  const browseLayout = await evaluatePage(page, () => {
    const sheet = document.querySelector(".studio-mobile-navigation-sheet");
    const header = document.querySelector(".studio-chrome");
    if (!(sheet instanceof HTMLElement) || !(header instanceof HTMLElement))
      return false;
    const bounds = sheet.getBoundingClientRect();
    return (
      Math.abs(bounds.top - header.getBoundingClientRect().bottom) <= 1 &&
      Math.abs(bounds.bottom - window.innerHeight) <= 1 &&
      sheet.querySelectorAll("details").length === 3 &&
      !sheet.querySelector(".studio-mobile-navigation-dock") &&
      ["Overview", "Chat", "Administration"].every((label) =>
        Array.from(sheet.querySelectorAll("section button")).some(
          (button) => button.getAttribute("aria-label") === label,
        ),
      ) &&
      !Array.from(sheet.querySelectorAll("button")).some(
        (button) => button.textContent.trim() === "Account",
      )
    );
  });
  if (!browseLayout)
    throw new Error(
      "Browse no longer matches the approved direct destinations and independently collapsible groups",
    );
  await fillLabel(page, "Filter destinations", "agen");
  await waitForPage("Browse filter narrows every group", () =>
    evaluatePage(page, () => {
      const links = Array.from(
        document.querySelectorAll(".studio-mobile-navigation-link"),
      );
      return (
        links.length === 1 && links[0]?.textContent.includes("Agents") === true
      );
    }),
  );
  await fillLabel(page, "Filter destinations", "");
  await waitForPage("Browse filter clears", () =>
    evaluatePage(
      page,
      () =>
        document.querySelectorAll(".studio-mobile-navigation-link").length > 1,
    ),
  );
  await page.cdp("Input.dispatchKeyEvent", {
    type: "keyDown",
    key: "Escape",
    code: "Escape",
    windowsVirtualKeyCode: 27,
  });
  await page.cdp("Input.dispatchKeyEvent", {
    type: "keyUp",
    key: "Escape",
    code: "Escape",
    windowsVirtualKeyCode: 27,
  });
  await waitForPage("Browse focus restoration", () =>
    page.evaluate<boolean>(
      'document.activeElement?.classList.contains("studio-mobile-switcher") === true',
    ),
  );
  await clickSelector(page, ".studio-mobile-switcher");
  await waitForSelector(page, ".studio-mobile-navigation-sheet");
  const libraryOpen = await page.evaluate<boolean>(
    'Array.from(document.querySelectorAll(".studio-mobile-navigation-group")).some(group => group.open && group.querySelector("summary")?.textContent.includes("Library"))',
  );
  if (!libraryOpen)
    await clickText(page, ".studio-mobile-navigation-group summary", "Library");
  await waitForPage("Library group rests open", () =>
    page.evaluate<boolean>(
      'Array.from(document.querySelectorAll("details")).some(group => group.open && group.querySelector("summary")?.textContent.includes("Library"))',
    ),
  );
  await clickText(page, ".studio-mobile-navigation-group summary", "Work");
  await waitForPage("independent Browse groups", () =>
    page.evaluate<boolean>(
      'document.querySelectorAll("details[open]").length >= 2',
    ),
  );
  await clickText(page, ".studio-mobile-navigation-group summary", "Library");
  await waitForPage("explicit group folding", () =>
    page.evaluate<boolean>(
      'Array.from(document.querySelectorAll("details")).some(group => !group.open && group.querySelector("summary")?.textContent.includes("Library"))',
    ),
  );
  await clickText(page, ".studio-mobile-navigation-group summary", "Library");
  if ((await page.evaluate<string>("location.pathname")) !== originalPath)
    throw new Error("Browse groups changed the working destination");
  await clickText(page, ".studio-mobile-navigation-link", "Field notes");
  await waitForPage("Studio phone context navigation", () =>
    page.evaluate<boolean>('location.pathname === "/studio/entities/posts"'),
  );
  await evaluatePage(page, () => history.back());
  await waitForPage("Studio phone context return", () =>
    page.evaluate<boolean>(
      `location.pathname === ${JSON.stringify(originalPath)}`,
    ),
  );
}

async function verifyDirectStudioNavigation(
  page: Bun.WebView,
  surface: string,
  width: number,
): Promise<void> {
  const expected =
    surface === "studio-chat"
      ? "Chat"
      : surface === "studio-administration"
        ? "Administration"
        : "Account";
  const state = await evaluatePage(page, () => ({
    labels: Array.from(
      document.querySelectorAll(".studio-area-link [data-area-label]"),
    ).map((node) => node.getAttribute("data-area-label")),
    current:
      document
        .querySelector('.studio-area-link[aria-pressed="true"]')
        ?.getAttribute("aria-label") ?? null,
    location: document
      .querySelector(".studio-chrome-location")
      ?.textContent.trim(),
    leaf: document.querySelector(".studio-leaf-rail") !== null,
    mainWidth: Math.round(
      document
        .querySelector(
          "[data-studio-body] > :not(aside), .studio-chat-workspace",
        )
        ?.getBoundingClientRect().width ?? 0,
    ),
    viewportWidth: document.documentElement.clientWidth,
    width: Math.round(
      document.querySelector(".rail")?.getBoundingClientRect().width ?? 0,
    ),
  }));
  if (
    state.labels.join("/") !== "Overview/Chat/Library/Work/Admin/System" ||
    state.current !== (expected === "Account" ? null : expected) ||
    state.location !== expected ||
    state.leaf ||
    (width > 900 && state.width !== 124) ||
    (width <= 900 && Math.abs(state.mainWidth - state.viewportWidth) > 1)
  )
    throw new Error(`Direct destination layout: ${JSON.stringify(state)}`);
  if (width > 900) {
    await clickSelector(page, ".studio-navigation-collapse");
    await waitForPage("direct collapsed width", () =>
      page.evaluate<boolean>(
        'Math.round(document.querySelector(".rail").getBoundingClientRect().width) === 68',
      ),
    );
    await clickSelector(page, ".studio-navigation-collapse");
    await waitForPage("direct expanded width", () =>
      page.evaluate<boolean>(
        'Math.round(document.querySelector(".rail").getBoundingClientRect().width) === 124',
      ),
    );
  }
}

async function verifyStudioProfileNavigation(
  page: Bun.WebView,
  surface: string,
): Promise<void> {
  const originalUrl = await page.evaluate<string>("location.href");
  await evaluatePage(page, () => {
    document.body.dataset["navigationProbe"] = "same-document";
  });
  if (surface === "studio-account") {
    await fillLabel(page, "Display name", "Unsaved profile name");
    await pointerDownSelector(page, ".studio-chrome-identity");
    await waitForSelector(page, '[role="menuitem"]');
    await clickText(page, '[role="menuitem"]', "Account");
    const preserved = await evaluatePage(
      page,
      () =>
        document.body.dataset["navigationProbe"] === "same-document" &&
        Array.from(document.querySelectorAll("input")).some(
          (input) => input.value === "Unsaved profile name",
        ),
    );
    if (
      !preserved ||
      (await page.evaluate<string>("location.href")) !== originalUrl
    )
      throw new Error("Same-page Account navigation reset profile edits");
    return;
  }
  await evaluatePage(page, () => {
    const input = document.querySelector('textarea[aria-label="Message"]');
    if (!(input instanceof HTMLTextAreaElement))
      throw new Error("Missing composer");
    Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      "value",
    )?.set?.call(input, "Keep this navigation draft");
    input.dispatchEvent(new InputEvent("input", { bubbles: true }));
  });
  await pointerDownSelector(page, ".studio-chrome-identity");
  await waitForSelector(page, '[role="menuitem"]');
  await clickText(page, '[role="menuitem"]', "Account");
  await waitForText(page, "Leave this conversation?");
  await clickText(
    page,
    '[role="dialog"] button, [role="alertdialog"] button',
    "Stay",
  );
  if ((await page.evaluate<string>("location.href")) !== originalUrl)
    throw new Error("Profile navigation ignored the Chat guard");
  await pointerDownSelector(page, ".studio-chrome-identity");
  await waitForSelector(page, '[role="menuitem"]');
  await clickText(page, '[role="menuitem"]', "Account");
  await waitForText(page, "Leave this conversation?");
  await clickText(
    page,
    '[role="dialog"] button, [role="alertdialog"] button',
    "Leave",
  );
  await waitForText(page, "Signed-in sessions");
  if (
    !(await page.evaluate<boolean>(
      'document.body.dataset.navigationProbe === "same-document"',
    ))
  )
    throw new Error(
      "Profile navigation reloaded the document instead of using the guarded router",
    );
  await evaluatePage(page, () => history.back());
  await waitForSelector(page, 'textarea[aria-label="Message"]');
  if (
    !(await page.evaluate<boolean>(
      'document.querySelector("textarea").value === "Keep this navigation draft"',
    )) ||
    (await page.evaluate<string>("location.href")) !== originalUrl
  )
    throw new Error("Profile navigation lost the session route or Chat draft");
  await evaluatePage(page, () => {
    const input = document.querySelector('textarea[aria-label="Message"]');
    if (!(input instanceof HTMLTextAreaElement))
      throw new Error("Missing composer");
    Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      "value",
    )?.set?.call(input, "");
    input.dispatchEvent(new InputEvent("input", { bubbles: true }));
  });
}

async function fillLabel(
  page: Bun.WebView,
  labelText: string,
  value: string,
): Promise<void> {
  const filled = await evaluatePageWith(
    page,
    ({ labelText: text, value: nextValue }) => {
      // Fields that carry their own label expose it as aria-label rather than
      // spending a line on it, so match either.
      const labelled = Array.from(
        document.querySelectorAll<HTMLElement>(
          "input[aria-label], textarea[aria-label]",
        ),
      ).find(
        (candidate) =>
          candidate.getAttribute("aria-label") === text &&
          candidate.getBoundingClientRect().height > 0,
      );
      const label = Array.from(document.querySelectorAll("label")).find(
        (candidate) =>
          candidate.textContent.includes(text) &&
          candidate.getBoundingClientRect().height > 0,
      );
      const input =
        labelled ??
        (label?.htmlFor
          ? document.getElementById(label.htmlFor)
          : label?.querySelector("input, textarea"));
      if (!(
        input instanceof HTMLInputElement ||
        input instanceof HTMLTextAreaElement
      )) {
        return false;
      }
      const prototype =
        input instanceof HTMLInputElement
          ? HTMLInputElement.prototype
          : HTMLTextAreaElement.prototype;
      Object.getOwnPropertyDescriptor(prototype, "value")?.set?.call(
        input,
        nextValue,
      );
      input.dispatchEvent(new InputEvent("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    },
    { labelText, value },
  );
  if (!filled) throw new Error(`Could not fill field labelled ${labelText}`);
}

async function blurLabel(page: Bun.WebView, labelText: string): Promise<void> {
  const blurred = await evaluatePageWith(
    page,
    (text) => {
      const label = Array.from(document.querySelectorAll("label")).find(
        (candidate) => candidate.textContent.includes(text),
      );
      const input = label?.htmlFor
        ? document.getElementById(label.htmlFor)
        : label?.querySelector("input, textarea");
      if (!(input instanceof HTMLElement)) return false;
      input.blur();
      return true;
    },
    labelText,
  );
  if (!blurred) throw new Error(`Could not blur field labelled ${labelText}`);
}

async function elementDisplay(
  page: Bun.WebView,
  selector: string,
): Promise<string> {
  return page.evaluate<string>(
    `(() => { const element = document.querySelector(${JSON.stringify(selector)}); return element ? getComputedStyle(element).display : "missing"; })()`,
  );
}

async function elementBounds(
  page: Bun.WebView,
  selector: string,
): Promise<
  { x: number; y: number; width: number; height: number } | undefined
> {
  return evaluatePageWith(
    page,
    (candidateSelector) => {
      const element = document.querySelector(candidateSelector);
      if (!(element instanceof HTMLElement)) return undefined;
      const bounds = element.getBoundingClientRect();
      return {
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height,
      };
    },
    selector,
  );
}

function networkRequestFromEvent(
  event: Event,
): BrowserNetworkEvent | undefined {
  if (!("data" in event)) return undefined;
  const data = event.data;
  if (
    typeof data !== "object" ||
    data === null ||
    !("requestId" in data) ||
    typeof data.requestId !== "string"
  ) {
    return undefined;
  }
  return { requestId: data.requestId };
}

async function navigateToNetworkIdle(
  page: Bun.WebView,
  url: string,
): Promise<void> {
  const activeRequests = new Set<string>();
  let lastActivity = performance.now();
  await page.cdp("Network.enable");
  page.addEventListener("Network.requestWillBeSent", (event: Event) => {
    const request = networkRequestFromEvent(event);
    if (!request) return;
    activeRequests.add(request.requestId);
    lastActivity = performance.now();
  });
  const finish = (event: Event): void => {
    const request = networkRequestFromEvent(event);
    if (!request) return;
    activeRequests.delete(request.requestId);
    lastActivity = performance.now();
  };
  page.addEventListener("Network.loadingFinished", finish);
  page.addEventListener("Network.loadingFailed", finish);
  await page.navigate(url);
  await waitForPage(`network idle for ${url}`, () =>
    Promise.resolve(
      activeRequests.size === 0 && performance.now() - lastActivity >= 500,
    ),
  );
}

async function waitForVisualStability(page: Bun.WebView): Promise<void> {
  await evaluatePage(
    page,
    () =>
      new Promise<void>((resolve) => {
        let previous = "";
        let stableFrames = 0;
        let sampledFrames = 0;
        const sample = (): void => {
          const positions = [
            window.scrollX,
            window.scrollY,
            ...Array.from(document.querySelectorAll<HTMLElement>("*"))
              .filter(
                (element) =>
                  element.scrollHeight > element.clientHeight + 1 ||
                  element.scrollWidth > element.clientWidth + 1,
              )
              .flatMap((element) => [element.scrollLeft, element.scrollTop]),
          ];
          const current = JSON.stringify(positions);
          stableFrames = current === previous ? stableFrames + 1 : 0;
          previous = current;
          sampledFrames++;
          if (stableFrames >= 4 || sampledFrames >= 180) {
            resolve();
            return;
          }
          requestAnimationFrame(sample);
        };
        requestAnimationFrame(sample);
      }),
  );
}

async function addVisualInitScript(
  page: Bun.WebView,
  conversation: string,
): Promise<void> {
  await page.cdp("Page.addScriptToEvaluateOnNewDocument", {
    source: `(() => {
      Date.now = () => ${FIXED_NOW};
      localStorage.setItem(
        "console.climate",
        new URL(location.href).searchParams.get("climate") ?? "instrument",
      );
      if (${JSON.stringify(STUDY_STATE !== "empty")}) localStorage.setItem(
        "brain:web-chat:conversation-id",
        ${JSON.stringify(conversation)},
      );
    })()`,
  });
}

/**
 * Studio splits into two phone layout contracts: app-shell surfaces (the
 * editor and its dialogs) hold fixed chrome around scrolling panes, while
 * reading surfaces scroll the document like any other page.
 */
function isStudioAppShellSurface(surface: string): boolean {
  return (
    surface === "studio-editor" ||
    (surface.startsWith("studio-system") && !surface.endsWith("-collection")) ||
    surface === "studio-delete" ||
    surface === "studio-conflict" ||
    surface === "studio-invalid" ||
    surface === "studio-upload"
  );
}

async function verifyStudioDialogKeyboard(page: Bun.WebView): Promise<void> {
  const ready = await evaluatePage(page, () => {
    const dialog = [
      ...document.querySelectorAll<HTMLElement>(
        '[role="dialog"], [role="alertdialog"]',
      ),
    ].find((node) => node.getBoundingClientRect().height > 0);
    if (!dialog) return false;
    const controls = [
      ...dialog.querySelectorAll<HTMLElement>(
        'button, input, select, textarea, summary, a[href], [tabindex], [contenteditable="true"]',
      ),
    ].filter((node) => {
      const closed = node.closest("details:not([open])");
      return (
        !node.matches(":disabled") &&
        node.tabIndex >= 0 &&
        node.getBoundingClientRect().height > 0 &&
        getComputedStyle(node).visibility !== "hidden" &&
        (!closed || closed.querySelector(":scope > summary")?.contains(node))
      );
    });
    const first = controls[0],
      last = controls.at(-1);
    if (!first || !last)
      throw new Error("Dialog has no keyboard-reachable controls");
    first.dataset["studioAuditFirst"] = "";
    last.dataset["studioAuditLast"] = "";
    const previous =
      document.activeElement instanceof HTMLElement &&
      dialog.contains(document.activeElement)
        ? document.activeElement
        : first;
    previous.dataset["studioAuditReturn"] = "";
    last.focus();
    if (document.activeElement !== last)
      throw new Error("Last dialog control could not receive focus");
    return true;
  });
  if (!ready) return;
  for (const [modifiers, expected] of [
    [0, "first"],
    [8, "last"],
  ] as const) {
    await page.cdp("Input.dispatchKeyEvent", {
      type: "keyDown",
      key: "Tab",
      code: "Tab",
      windowsVirtualKeyCode: 9,
      modifiers,
    });
    await page.cdp("Input.dispatchKeyEvent", {
      type: "keyUp",
      key: "Tab",
      code: "Tab",
      windowsVirtualKeyCode: 9,
      modifiers,
    });
    await evaluatePageWith(
      page,
      (edge) => {
        if (
          document.activeElement !==
          document.querySelector(`[data-studio-audit-${edge}]`)
        )
          throw new Error(
            `Dialog focus did not wrap to ${edge} control: active=${document.activeElement?.outerHTML.slice(0, 350)} expected=${document.querySelector(`[data-studio-audit-${edge}]`)?.outerHTML.slice(0, 350)}`,
          );
      },
      expected,
    );
  }
  await evaluatePage(page, () => {
    document.querySelector<HTMLElement>("[data-studio-audit-return]")?.focus();
    for (const edge of ["first", "last", "return"])
      document
        .querySelector(`[data-studio-audit-${edge}]`)
        ?.removeAttribute(`data-studio-audit-${edge}`);
  });
}

async function auditStudioAccessibility(
  page: Bun.WebView,
  name: string,
): Promise<void> {
  if (!AUDIT_ACCESSIBILITY) return;
  await page.evaluate(`(() => { ${axe.source}; return true; })()`);
  const audit = await evaluatePage(page, async () => {
    const runtime = (globalThis as unknown as { axe: typeof axe }).axe;
    const result = await runtime.run(document, {
      runOnly: {
        type: "tag",
        values: ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"],
      },
    });
    return {
      violations: result.violations,
      incomplete: result.incomplete,
      passedRules: result.passes.map((rule) => rule.id),
    };
  });
  await writeFile(
    path.join(ARTIFACT_DIR, `${name}-a11y.json`),
    JSON.stringify(audit, null, 2),
  );
  if (audit.violations.length)
    failures.push(
      `${name}: accessibility ${audit.violations.map((violation) => `${violation.id} (${violation.nodes.length})`).join(", ")}`,
    );
}

interface StudioScrollAudit {
  left: number;
  top: number;
  regions: Array<{ node: HTMLElement; left: number; top: number }>;
}

async function verifyStudioKeyboardAccess(page: Bun.WebView): Promise<void> {
  await evaluatePage(page, () => {
    const host = globalThis as unknown as {
      __studioScrollAudit?: StudioScrollAudit;
    };
    host.__studioScrollAudit = {
      left: window.scrollX,
      top: window.scrollY,
      regions: [...document.querySelectorAll<HTMLElement>("*")]
        .filter(
          (node) =>
            node.scrollHeight > node.clientHeight ||
            node.scrollWidth > node.clientWidth,
        )
        .map((node) => ({ node, left: node.scrollLeft, top: node.scrollTop })),
    };
  });
  try {
    await verifyStudioDialogKeyboard(page);
    const ready = await evaluatePage(page, () => {
      if (
        [
          ...document.querySelectorAll<HTMLElement>(
            '[role="dialog"], [role="alertdialog"], [role="menu"]',
          ),
        ].some((node) => node.getBoundingClientRect().height > 0)
      )
        return false;
      const skip = document.querySelector<HTMLButtonElement>(
        ".studio-skip-content",
      );
      if (!skip) return false;
      skip.focus();
      if (skip.getBoundingClientRect().top < 0)
        throw new Error("Skip control is not visible on focus");
      return true;
    });
    if (!ready) return;
    await page.cdp("Input.dispatchKeyEvent", {
      type: "keyDown",
      key: "Enter",
      code: "Enter",
      windowsVirtualKeyCode: 13,
      text: "\r",
      unmodifiedText: "\r",
    });
    await page.cdp("Input.dispatchKeyEvent", {
      type: "keyUp",
      key: "Enter",
      code: "Enter",
      windowsVirtualKeyCode: 13,
    });
    await evaluatePage(page, () => {
      const active = document.activeElement;
      if (
        !(active instanceof HTMLElement) ||
        !active.matches('main, [role="main"]') ||
        active.id === "root" ||
        active.querySelector(".studio-chrome")
      )
        throw new Error(
          `Skip to content did not focus the main landmark: ${active?.outerHTML.slice(0, 240)}`,
        );
    });
    await page.cdp("Input.dispatchKeyEvent", {
      type: "keyDown",
      key: "Tab",
      code: "Tab",
      windowsVirtualKeyCode: 9,
    });
    await page.cdp("Input.dispatchKeyEvent", {
      type: "keyUp",
      key: "Tab",
      code: "Tab",
      windowsVirtualKeyCode: 9,
    });
    await evaluatePage(page, () => {
      const main = document.querySelector(
        '[data-studio-shell] main, [data-studio-shell] [role="main"]',
      );
      const active = document.activeElement;
      if (!(active instanceof HTMLElement) || !main?.contains(active))
        throw new Error("Tab after skipping content returned to navigation");
      const chrome = document
        .querySelector(".studio-chrome")
        ?.getBoundingClientRect();
      if (chrome && active.getBoundingClientRect().top < chrome.bottom - 1)
        throw new Error("Content focus is obscured by Studio chrome");
      active.blur();
    });
    const previous = await evaluatePage(page, () => {
      const thread = document.querySelector<HTMLElement>(
        ".studio-chat-thread-scroll",
      );
      if (
        !thread ||
        thread.scrollTop <= 0 ||
        thread.getBoundingClientRect().height === 0
      )
        return null;
      thread.focus();
      return {
        top: thread.scrollTop,
        atLatest:
          thread.scrollHeight - thread.clientHeight - thread.scrollTop <= 48,
      };
    });
    if (previous !== null) {
      await page.cdp("Input.dispatchKeyEvent", {
        type: "keyDown",
        key: "PageUp",
        code: "PageUp",
        windowsVirtualKeyCode: 33,
      });
      await page.cdp("Input.dispatchKeyEvent", {
        type: "keyUp",
        key: "PageUp",
        code: "PageUp",
        windowsVirtualKeyCode: 33,
      });
      await waitForPage("keyboard conversation scrolling", () =>
        evaluatePageWith(
          page,
          (top) =>
            (document.querySelector(".studio-chat-thread-scroll")?.scrollTop ??
              top) < top,
          previous.top,
        ),
      );
      await waitForVisualStability(page);
      await evaluatePageWith(
        page,
        (position) => {
          const thread = document.querySelector<HTMLElement>(
            ".studio-chat-thread-scroll",
          );
          if (thread) {
            if (position.atLatest)
              [...document.querySelectorAll("button")]
                .find((button) => button.textContent.includes("Jump to latest"))
                ?.click();
            thread.scrollTo({
              top: position.atLatest ? thread.scrollHeight : position.top,
              behavior: "instant",
            });
            thread.blur();
          }
        },
        previous,
      );
    }
  } finally {
    // Keyboard focus can scroll the document, workspace, or editor independently.
    await evaluatePage(page, () => {
      const host = globalThis as unknown as {
        __studioScrollAudit?: StudioScrollAudit;
      };
      const snapshot = host.__studioScrollAudit;
      if (!snapshot) return;
      for (const { node, left, top } of snapshot.regions)
        if (node.isConnected) node.scrollTo({ left, top, behavior: "instant" });
      window.scrollTo({
        left: snapshot.left,
        top: snapshot.top,
        behavior: "instant",
      });
      delete host.__studioScrollAudit;
    });
  }
}

async function verifyDisabledPrimaries(page: Bun.WebView): Promise<void> {
  const check = async (): Promise<{ x: number; y: number } | undefined> =>
    evaluatePage(page, () => {
      let point: { x: number; y: number } | undefined;
      for (const button of document.querySelectorAll<HTMLButtonElement>(
        'button[data-slot="button"]:is([data-variant="default"], [data-variant="primary"]):disabled',
      )) {
        const reference = document.createElement("span");
        reference.style.cssText =
          "display:none;background-color:var(--console-card-soft);color:var(--console-text-muted);border:1px solid var(--console-rule-strong)";
        button.append(reference);
        const expected = getComputedStyle(reference),
          actual = getComputedStyle(button);
        const neutral =
          actual.backgroundColor === expected.backgroundColor &&
          actual.color === expected.color &&
          actual.borderTopColor === expected.borderTopColor &&
          actual.opacity === "1" &&
          actual.transform === "none";
        reference.remove();
        if (!neutral)
          throw Error(
            `Disabled primary must stay neutral, including on hover: ${button.getAttribute("aria-label") ?? button.textContent}`,
          );
        const rect = button.getBoundingClientRect();
        if (
          rect.width > 0 &&
          rect.height > 0 &&
          rect.top >= 0 &&
          rect.bottom <= innerHeight &&
          rect.left >= 0 &&
          rect.right <= innerWidth
        )
          point = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
      }
      return point;
    });
  const point = await check();
  if (point) {
    await page.cdp("Input.dispatchMouseEvent", {
      type: "mouseMoved",
      ...point,
    });
    await waitForVisualStability(page);
    await check();
    await page.cdp("Input.dispatchMouseEvent", {
      type: "mouseMoved",
      x: 0,
      y: 0,
    });
  }
}

async function verifyCollectionFiltersFit(page: Bun.WebView): Promise<void> {
  await evaluatePage(page, () => {
    const panel = document.querySelector<HTMLElement>(
      ".studio-collection-controls details[open] > div",
    );
    if (!panel) throw Error("Missing open collection filters");
    const bounds = panel.getBoundingClientRect();
    if (bounds.width <= 0 || panel.scrollWidth > panel.clientWidth + 1)
      throw Error("Collection filters overflow their panel");
    for (const field of panel.querySelectorAll("select, input")) {
      const rect = field.getBoundingClientRect();
      if (
        rect.width <= 0 ||
        rect.left < bounds.left - 1 ||
        rect.right > bounds.right + 1 ||
        rect.right > innerWidth
      )
        throw Error("Collection filter control is clipped");
    }
    panel.querySelector<HTMLSelectElement>("select")?.focus();
  });
  await page.cdp("Input.dispatchKeyEvent", {
    type: "keyDown",
    key: "Escape",
    code: "Escape",
    windowsVirtualKeyCode: 27,
  });
  await page.cdp("Input.dispatchKeyEvent", {
    type: "keyUp",
    key: "Escape",
    code: "Escape",
    windowsVirtualKeyCode: 27,
  });
  await evaluatePage(page, () => {
    const details = document.querySelector<HTMLDetailsElement>(
      ".studio-collection-controls details",
    );
    if (
      !details ||
      details.open ||
      document.activeElement !== details.querySelector("summary")
    )
      throw Error(
        "Escape must close only the filters and restore their trigger",
      );
  });
  await clickText(page, ".studio-collection-controls summary", "Filter");
}

async function verifyNativeDateFits(page: Bun.WebView): Promise<void> {
  // The input's own scrollWidth does not expose clipped native date segments.
  // Inspect Chromium's user-agent shadow layout instead of guessing its locale.
  interface NativeNode {
    nodeId: number;
    nodeName: string;
    attributes?: string[];
    children?: NativeNode[];
    shadowRoots?: NativeNode[];
  }
  const tree = await page.cdp<{ root: NativeNode }>("DOM.getDocument", {
    depth: -1,
    pierce: true,
  });
  function nodes(node: NativeNode): NativeNode[] {
    return [
      node,
      ...[...(node.children ?? []), ...(node.shadowRoots ?? [])].flatMap(nodes),
    ];
  }
  const input = nodes(tree.root).find(
    (node) =>
      node.nodeName === "INPUT" && node.attributes?.includes("datetime-local"),
  );
  if (!input) throw Error("Missing native date input");
  const shadow = nodes(input);
  const edit = shadow.find((node) =>
    node.attributes?.includes("-webkit-datetime-edit"),
  );
  const fields = shadow.find((node) =>
    node.attributes?.includes("-webkit-datetime-edit-fields-wrapper"),
  );
  if (!edit || !fields) throw Error("Native date layout is unavailable");
  const box = await page.cdp<{ model: { content: number[] } }>(
    "DOM.getBoxModel",
    { nodeId: edit.nodeId },
  );
  const text = await page.cdp<{ model: { content: number[] } }>(
    "DOM.getBoxModel",
    { nodeId: fields.nodeId },
  );
  const left = box.model.content[0],
    right = box.model.content[2],
    textLeft = text.model.content[0],
    textRight = text.model.content[2];
  if (
    left === undefined ||
    right === undefined ||
    textLeft === undefined ||
    textRight === undefined ||
    textLeft < left - 1 ||
    textRight > right + 1
  )
    throw Error(
      `Native date/time segments are clipped: ${JSON.stringify({ left, right, textLeft, textRight })}`,
    );
}

async function checkLayout(
  page: Bun.WebView,
  surface: string,
  width: number,
  viewportHeight: number,
): Promise<void> {
  const dimensions = await evaluatePage(page, () => ({
    clientWidth: document.documentElement.clientWidth,
    clientHeight: document.documentElement.clientHeight,
    scrollWidth: document.documentElement.scrollWidth,
    scrollHeight: document.documentElement.scrollHeight,
    rootOverflowY: getComputedStyle(document.documentElement).overflowY,
    bodyOverflowY: getComputedStyle(document.body).overflowY,
  }));
  if (dimensions.scrollWidth !== dimensions.clientWidth) {
    throw new Error(
      `${surface} at ${width}px has document overflow (${dimensions.scrollWidth} > ${dimensions.clientWidth})`,
    );
  }

  if (surface.startsWith("chat")) {
    const mobileTrigger = await elementDisplay(
      page,
      ".web-chat-mobile-trigger",
    );
    if (width <= 640 !== (mobileTrigger !== "none"))
      throw new Error(`chat responsive mode mismatch at ${width}px`);
    const composer = await elementBounds(page, ".web-chat-prompt-input");
    if (!composer || composer.y + composer.height > viewportHeight + 1)
      throw new Error(`chat composer escaped the viewport at ${width}px`);
  }
  if (surface.startsWith("studio-") && width <= 640) {
    const chrome = await elementBounds(page, ".studio > .studio-chrome");
    if (!chrome || chrome.height > 64) {
      throw new Error(`Studio header exceeded the phone chrome budget`);
    }
    const smallActions = await evaluatePage(page, () =>
      Array.from(
        document.querySelectorAll<HTMLElement>(
          '[data-record-trailing="true"] button[data-variant="link"]',
        ),
      )
        .filter((button) => {
          const bounds = button.getBoundingClientRect();
          const minimum =
            parseFloat(
              getComputedStyle(button).getPropertyValue("--console-touch"),
            ) || 40;
          return bounds.height > 0 && bounds.height < minimum;
        })
        .map((button) => button.textContent.trim()),
    );
    if (smallActions.length)
      throw new Error(
        `Text actions lost their phone touch targets: ${smallActions.join(", ")}`,
      );
  }
  if (
    surface.startsWith("studio-") &&
    !surface.startsWith("studio-chat") &&
    width <= 640
  ) {
    const railDisplay = await elementDisplay(
      page,
      "[data-studio-shell] > [data-studio-body] > .rail",
    );
    if (railDisplay !== "none") {
      throw new Error(`Studio rendered a duplicate phone navigation rail`);
    }
    // One phone scroll region, and the right one owns it. The editor is an app
    // shell — fixed pane switcher, pinned save bar — so it locks the document
    // and scrolls its panes. Reading surfaces are documents: locking them
    // would pin the mobile browser's collapsible URL bar open, costing more
    // viewport than the chrome budget ever saves, so the document scrolls and
    // nothing nested may scroll with it.
    const scrollRegions = await evaluatePage(page, () =>
      Array.from(document.querySelectorAll<HTMLElement>("*"))
        .filter((element) => {
          const overflowY = getComputedStyle(element).overflowY;
          return (
            (overflowY === "auto" || overflowY === "scroll") &&
            element.scrollHeight > element.clientHeight + 1
          );
        })
        .map((element) => element.className.toString().slice(0, 60)),
    );
    const hasOpenActionSheet =
      surface === "studio-administration-invitations-form" ||
      surface.startsWith("studio-navigation");
    if (hasOpenActionSheet) {
      const dialog = await elementBounds(page, '[role="dialog"]');
      if (!dialog || dialog.y + dialog.height > viewportHeight + 1) {
        throw new Error(`Studio action sheet escaped the phone viewport`);
      }
    } else if (isStudioAppShellSurface(surface)) {
      if (
        dimensions.scrollHeight > dimensions.clientHeight + 1 &&
        dimensions.rootOverflowY !== "hidden" &&
        dimensions.bodyOverflowY !== "hidden"
      ) {
        throw new Error(
          `Studio editor created a second phone scroll region (${dimensions.scrollHeight} > ${dimensions.clientHeight})`,
        );
      }
    } else if (scrollRegions.length > 0) {
      throw new Error(
        `Studio nested a phone scroll region inside the document: ${JSON.stringify(scrollRegions)}`,
      );
    } else if (
      dimensions.rootOverflowY === "hidden" ||
      dimensions.bodyOverflowY === "hidden"
    ) {
      throw new Error(
        `Studio locked the phone document scroll on a reading surface`,
      );
    }
    const head = await elementBounds(page, ".studio-page-head");
    if (!head || head.y > 132) {
      const chrome = await evaluatePage(page, () =>
        [
          ".console-strip",
          ".rail",
          ".studio-mobile-switcher",
          "[data-studio-body]",
          ".studio-workspace-frame",
          "[data-studio-library]",
          ".account-studio-pane",
        ].map((selector) => {
          const element = document.querySelector(selector);
          if (!(element instanceof HTMLElement)) return `${selector}: absent`;
          const bounds = element.getBoundingClientRect();
          return `${selector}: y=${Math.round(bounds.y)} h=${Math.round(bounds.height)} display=${getComputedStyle(element).display}`;
        }),
      );
      throw new Error(
        `Studio content starts too low at ${width}px (${head?.y ?? "missing"})\n  ${chrome.join("\n  ")}`,
      );
    }
    const expectsPrimaryAction =
      surface === "studio-library" ||
      surface.startsWith("studio-administration-invitations");
    if (expectsPrimaryAction) {
      const action = await elementBounds(page, ".studio-page-head-action");
      if (
        !action ||
        action.y < head.y - 1 ||
        action.y + action.height > head.y + head.height + 1 ||
        action.x < 11 ||
        action.x + action.width > dimensions.clientWidth - 11
      ) {
        throw new Error(
          `Studio primary action escaped the phone page head: ${JSON.stringify(action)}`,
        );
      }
    }
    const switcherState = await evaluatePage(page, () => {
      const rail = document.querySelector(".rail");
      if (!(rail instanceof HTMLElement)) return undefined;
      if (getComputedStyle(rail).display === "none") {
        return { visible: false, overflow: false, focusReached: true };
      }
      const switcher = rail.querySelector(".studio-mobile-switcher");
      const desktopTypes = rail.querySelector(".types");
      if (!(switcher instanceof HTMLButtonElement)) {
        return { visible: true, overflow: false, focusReached: false };
      }
      switcher.focus();
      const focusReached = document.activeElement === switcher;
      switcher.blur();
      const railBounds = rail.getBoundingClientRect();
      const switcherBounds = switcher.getBoundingClientRect();
      return {
        visible: getComputedStyle(switcher).display !== "none",
        overflow: rail.scrollWidth > rail.clientWidth + 1,
        focusReached,
        desktopTypesHidden:
          desktopTypes instanceof HTMLElement &&
          getComputedStyle(desktopTypes).display === "none",
        height: railBounds.height,
        triggerWidth: switcherBounds.width,
        availableWidth: railBounds.width - 24,
      };
    });
    if (
      switcherState?.visible &&
      (switcherState.overflow ||
        switcherState.desktopTypesHidden !== true ||
        switcherState.height > 56 ||
        Math.abs(switcherState.triggerWidth - switcherState.availableWidth) > 1)
    ) {
      throw new Error(
        `Studio phone context picker exceeded its chrome budget: ${JSON.stringify(switcherState)}`,
      );
    }
    if (!hasOpenActionSheet && switcherState?.focusReached === false) {
      throw new Error(`Studio phone context picker was not keyboard reachable`);
    }
    if (surface.startsWith("studio-administration")) {
      const records = await elementBounds(
        page,
        STUDY_STATE === "empty"
          ? ".declarative-detail-master"
          : ".declarative-detail-master .operator-record-list",
      );
      if (!records || records.width > width)
        throw new Error(
          "Administration must use bounded record lists, not reflowed tables",
        );
    }
  }
  if (surface.startsWith("studio-")) {
    await evaluatePage(page, () => {
      const head = document.querySelector<HTMLElement>(
        "[data-studio-page-head]",
      );
      const frame = head?.closest<HTMLElement>(
        "[data-studio-editor], [data-studio-library], .studio-workspace-frame, .studio-chat-workspace, .account-shell",
      );
      if (head && frame) {
        const box = head.getBoundingClientRect();
        const parent = frame.getBoundingClientRect();
        const inset = innerWidth <= 640 ? 20 : 36;
        const left =
          box.left - parent.left - frame.clientLeft + frame.scrollLeft;
        const right = frame.clientWidth - left - box.width;
        const top = box.top - parent.top - frame.clientTop + frame.scrollTop;
        if (Math.abs(left - inset) > 1 || Math.abs(right - inset) > 1)
          throw new Error(
            `Page heading inset mismatch: ${left}/${right}, expected ${inset}`,
          );
        if (
          frame.firstElementChild?.contains(head) &&
          Math.abs(top - (innerWidth <= 640 ? 24 : 36)) > 1
        )
          throw new Error(`Page heading top inset mismatch: ${top}`);
        const title = head.querySelector("h1");
        if (
          !title ||
          getComputedStyle(title).fontSize !==
            (innerWidth <= 640 ? "29px" : "36px") ||
          getComputedStyle(title).fontWeight !== "600"
        )
          throw new Error("Page heading display scale diverged");
        const action = head.querySelector(".studio-page-head-action");
        if (action) {
          const control = action.getBoundingClientRect();
          const heading = title.getBoundingClientRect();
          if (
            control.left < heading.right - 1 ||
            control.top - heading.top >
              parseFloat(getComputedStyle(title).fontSize)
          )
            throw new Error(
              "Page action overlaps the title or falls below its first line",
            );
        }
        if (
          getComputedStyle(head).borderBottomWidth !== "2px" ||
          getComputedStyle(head).borderBottomColor !==
            getComputedStyle(title).color
        )
          throw new Error("Page heading divider diverged");
      }
      const typeRoles = [
        {
          selector: ".people-detail-name, .studio-leaf-head h2",
          size: "24px",
          weight: "500",
          tracking: -0.48,
        },
        {
          selector:
            ".account-section-label h3, .studio-chat-sessions-title, .studio-chat-context-card-title, .studio-mobile-group-name",
          size: "14px",
          weight: "650",
        },
        {
          selector:
            '.studio-chrome-brand, .studio-area-title, .studio-leaf-label, .studio-mobile-switcher, [data-studio-editor] aside > div > h2, button[aria-label="Editor view"], [aria-label="Publication actions"] header, [aria-label="Publication actions"] b, [data-studio-shell] th',
          size: "10px",
          weight: "600",
          tracking: 1.2,
        },
      ];
      for (const role of typeRoles) {
        for (const element of document.querySelectorAll(role.selector)) {
          const font = getComputedStyle(element);
          if (
            font.fontSize !== role.size ||
            font.fontWeight !== role.weight ||
            (role.tracking !== undefined &&
              !(
                Math.abs(parseFloat(font.letterSpacing) - role.tracking) <= 0.01
              )) ||
            (role.size === "10px" && font.textTransform !== "uppercase")
          )
            throw new Error(
              `Studio type role diverged for ${element.textContent.trim()}: ${font.fontSize}/${font.fontWeight}/${font.letterSpacing}`,
            );
        }
      }
      const shell = document.querySelector("[data-studio-shell]");
      const uiFamily = shell ? getComputedStyle(shell).fontFamily : undefined;
      const cardWeights: Record<string, string> = {
        "10px": "600",
        "14px": "650",
        "24px": "500",
        // Attention disclosures retain the shared control's separate callout role.
        "18px": "500",
      };
      for (const title of document.querySelectorAll(
        ".declarative-card > header > h2",
      )) {
        if (!title.parentElement) throw new Error("Missing card heading owner");
        const font = getComputedStyle(title);
        const owner = getComputedStyle(title.parentElement);
        const tracking =
          font.fontSize === "10px"
            ? 1.2
            : font.fontSize === "24px"
              ? -0.48
              : undefined;
        if (
          (font.fontSize === "14px" && font.fontFamily !== uiFamily) ||
          (tracking !== undefined &&
            !(Math.abs(parseFloat(font.letterSpacing) - tracking) <= 0.01)) ||
          font.fontWeight !== cardWeights[font.fontSize] ||
          font.fontSize !== owner.fontSize ||
          font.fontWeight !== owner.fontWeight ||
          font.fontFamily !== owner.fontFamily ||
          font.letterSpacing !== owner.letterSpacing
        )
          throw new Error(
            `Hosted card type role diverged: ${title.textContent}/${font.fontSize}/${font.fontWeight}`,
          );
      }
      const context = document.createElement("canvas").getContext("2d");
      if (!context) throw new Error("Cannot measure tag placeholders");
      for (const input of document.querySelectorAll<HTMLInputElement>(
        'input[placeholder="Add tag"]',
      )) {
        if (!input.getBoundingClientRect().width) continue;
        const font = getComputedStyle(input);
        context.font = `${font.fontWeight} ${font.fontSize} ${font.fontFamily}`;
        if (
          input.clientWidth -
            parseFloat(font.paddingLeft) -
            parseFloat(font.paddingRight) <
          context.measureText(input.placeholder).width + 2
        )
          throw new Error("Tag placeholder clips its label or caret");
      }
    });
  }
  if (surface === "studio-overview") {
    await evaluatePage(page, () => {
      const navigation =
        document.querySelector<HTMLElement>(".studio-navigation");
      if (
        navigation?.dataset["leafOpen"] !== "false" ||
        navigation.querySelector(".studio-leaf-rail")
      )
        throw new Error(
          "Overview must remain a direct destination without a leaf column",
        );
      if (
        innerWidth > 900 &&
        Math.abs(navigation.getBoundingClientRect().width - 124) > 1
      )
        throw new Error(
          "Overview navigation still reserves a duplicate leaf column",
        );
    });
  }
  if (surface.startsWith("studio-chat")) {
    const destinations = await elementDisplay(
      page,
      ".studio-chat-session-picker-trigger",
    );
    const sessions = await elementDisplay(page, ".studio-chat-sessions");
    if (
      destinations === "missing" ||
      destinations === "none" ||
      sessions !== "missing"
    ) {
      throw new Error(`Studio Chat must keep history on demand at ${width}px`);
    }
    const workspace = await elementBounds(page, ".studio-chat-room");
    const composer = await elementBounds(page, ".studio-chat-composer");
    const transcript = await elementBounds(page, ".studio-chat-thread-scroll");
    if (
      !transcript ||
      !workspace ||
      transcript.height < workspace.height * 0.55
    )
      throw new Error("Conversation must dominate the workspace");
    await evaluatePage(page, () => {
      if (
        document.querySelector(
          ".studio-chat-workspace > [data-studio-page-head]",
        )
      )
        throw new Error("Chat duplicates its page header");
      const form = document.querySelector(".studio-chat-composer-form");
      if (
        !form ||
        getComputedStyle(form).borderTopWidth !== "1px" ||
        getComputedStyle(form).borderRadius !== "12px"
      )
        throw new Error(
          `Composer frame missing: ${form ? getComputedStyle(form).cssText + form.className + getComputedStyle(form).borderTop : "missing"}`,
        );
      if (
        document.querySelector(
          ".studio-chat-thread-scroll .studio-chat-context",
        )
      )
        throw new Error("Context must stay outside the dialogue");
    });
    if (!composer) {
      throw new Error(`Studio Chat workspace did not render at ${width}px`);
    }
    if (composer.y + composer.height > viewportHeight + 1) {
      throw new Error(
        `Studio Chat composer escaped the viewport at ${width}px: ${JSON.stringify({ composer, workspace, viewportHeight, root: await elementBounds(page, ".studio"), frame: await elementBounds(page, ".studio-chat-workspace") })}`,
      );
    }
    if (composer.y + composer.height > workspace.y + workspace.height + 1) {
      throw new Error(
        `Studio Chat composer escaped its working room at ${width}px`,
      );
    }
  }
  if (isStudioAppShellSurface(surface)) {
    const stacked = await evaluatePage(page, () => {
      const editor = document.querySelector("[data-studio-editor]");
      return editor?.getAttribute("data-editor-presentation") !== "split";
    });
    if (stacked) {
      if (await elementBounds(page, ".studio-mobile-tabs"))
        throw new Error("Stacked editors must not duplicate body navigation");
      // Compare against the usable scrollport, not its scrollbar-inclusive box.
      const contentWidth = await evaluatePage(
        page,
        () =>
          document.querySelector("[data-studio-editor-content]")?.clientWidth ??
          0,
      );
      const properties = await elementBounds(page, "[data-studio-properties]");
      const insets = width > 640 ? 72 : 40;
      if (
        !contentWidth ||
        !properties ||
        properties.width < contentWidth - insets - 2
      )
        throw new Error(
          "System Properties must use the available editor width",
        );
      if (
        (await elementDisplay(page, '[aria-label="Editor body view"]')) ===
        "none"
      )
        throw new Error("Stacked body modes must remain available on phones");
    } else {
      const modes = await elementDisplay(page, ".studio-mobile-tabs");
      if (width <= 640 !== (modes !== "none"))
        throw new Error(`Studio responsive mode mismatch at ${width}px`);
    }
    if (width <= 900) {
      const pipeline = await elementBounds(page, "[data-studio-save-bar]");
      if (!pipeline || pipeline.y + pipeline.height > viewportHeight + 1)
        throw new Error(`Studio save bar escaped the viewport at ${width}px`);
      if (width <= 640) {
        const more = await elementBounds(
            page,
            'button[aria-label="More document actions"]',
          ),
          save = await elementBounds(page, ".studio-editor-head-save");
        const readOnlyProfile = systemFixtures.get(
          surface.slice("studio-system-".length),
        )?.readOnly;
        if (readOnlyProfile) {
          if (save) throw Error("Read-only profiles must not offer Save");
        } else if (!save || save.width < 44 || save.height < 44 || save.y > 220)
          throw Error("Phone Save must remain visible in the document head");
        if (
          more &&
          (pipeline.x + pipeline.width - (more.x + more.width) > 24 ||
            more.width < 44 ||
            more.height < 44)
        )
          throw Error(
            `Phone document actions must stay at the end of the save bar: ${JSON.stringify({ pipeline, more })}`,
          );
      }
    }
  }
}

async function comparePng(
  actual: Buffer,
  baselinePath: string,
): Promise<number> {
  const baseline = await readFile(baselinePath);
  const left = PNG.sync.read(actual);
  const right = PNG.sync.read(baseline);
  if (left.width !== right.width || left.height !== right.height) return 1;
  let changed = 0;
  const pixels = left.width * left.height;
  for (let offset = 0; offset < left.data.length; offset += 4) {
    if (
      Math.abs(left.data.readUInt8(offset) - right.data.readUInt8(offset)) >
        12 ||
      Math.abs(
        left.data.readUInt8(offset + 1) - right.data.readUInt8(offset + 1),
      ) > 12 ||
      Math.abs(
        left.data.readUInt8(offset + 2) - right.data.readUInt8(offset + 2),
      ) > 12 ||
      Math.abs(
        left.data.readUInt8(offset + 3) - right.data.readUInt8(offset + 3),
      ) > 12
    )
      changed += 1;
  }
  return changed / pixels;
}

await mkdir(BASELINE_DIR, { recursive: true });
await mkdir(ARTIFACT_DIR, { recursive: true });
const studioUiDirectory = path.join(ROOT, "plugins/studio/dist/ui");
const studioAsset = path.join(studioUiDirectory, "studio-app.js");
const chatAsset = path.join(ROOT, "interfaces/web-chat/dist/ui/app.js");
const chatStyles = path.join(ROOT, "interfaces/web-chat/dist/ui/app.css");
await Promise.all([
  readFile(studioAsset),
  readFile(chatAsset),
  readFile(chatStyles),
]).catch(() => {
  throw new Error(
    "Build @brains/studio and @brains/web-chat UI assets before visual regression.",
  );
});

// Deterministic preview image for the attachment card: a flat verdigris
// board rendered once at startup.
const fixturePng = new PNG({ width: 480, height: 270 });
for (let offset = 0; offset < fixturePng.data.length; offset += 4) {
  fixturePng.data[offset] = 61;
  fixturePng.data[offset + 1] = 107;
  fixturePng.data[offset + 2] = 92;
  fixturePng.data[offset + 3] = 255;
}
// PNG.sync.write hands back a Node Buffer, whose ArrayBufferLike backing is not
// a BodyInit. The view is the same bytes without a copy of the pixel data.
const fixtureImage = new Uint8Array(PNG.sync.write(fixturePng));

const pendingUploadResponses = new Set<() => void>();
let retryImageUploadFailed = false;
const administrationFixture = await createAdministrationFixture(
  FIXED_NOW,
  STUDY_STATE,
);
const workViewFixtures = await createWorkViewFixtures(STUDY_STATE);
const deliveryViewFixtures = await createDeliveryViewFixtures(STUDY_STATE);
const syncViewFixture = await createSyncViewFixture(STUDY_STATE);
const sessionTitleOverrides = new Map<string, string>();
const server = Bun.serve({
  port: 0,
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === "/fixture/verdigris.png")
      return new Response(fixtureImage, {
        headers: { "content-type": "image/png" },
      });
    if (url.pathname === "/dashboard") {
      const input = dashboardInput();
      if (url.searchParams.get("fixture-state") === "dense-map") {
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
      if (url.searchParams.get("fixture-state") === "declarative-network") {
        const network = input.widgets["agent-discovery:agent-proximity"];
        if (network) delete network.component;
      }
      if (url.searchParams.get("fixture-state") === "waiting") {
        input.widgets = {};
        input.appInfo.interactions = input.appInfo.interactions.map(
          (interaction) =>
            interaction.id === "chat"
              ? { ...interaction, status: "disabled" }
              : interaction,
        );
      }
      return new Response(
        climateHtml(renderDashboardPageHtml(input), request),
        { headers: { "content-type": "text/html" } },
      );
    }
    if (url.pathname === "/ask")
      return new Response(
        climateHtml(
          renderChatPage({
            apiPath: "/api/chat",
            dashboardHref: "/dashboard",
            studioHref: "/chat",
            sessionHref: "/logout",
            principal: { displayName: "Mira Reyes", role: "admin" },
          }),
          request,
        ),
        { headers: { "content-type": "text/html" } },
      );
    if (url.pathname === "/ask/assets/app.js")
      return new Response(await readFile(chatAsset), {
        headers: { "content-type": "text/javascript" },
      });
    if (url.pathname === "/ask/assets/app.css")
      return new Response(await readFile(chatStyles), {
        headers: { "content-type": "text/css" },
      });
    if (url.pathname === "/api/chat/sessions") {
      if (request.method === "PUT") {
        const { title } = renameChatSessionRequestSchema.parse(
          await request.json(),
        );
        sessionTitleOverrides.set(url.searchParams.get("id") ?? "", title);
        return json({ renamed: true, title });
      }
      const records =
        url.searchParams.get("archived") === "true"
          ? [
              {
                id: "archived-review",
                title: "Archived review",
                lastActiveAt: "2026-07-01T12:00:00Z",
                archived: true,
              },
            ]
          : sessions.map((session) => ({
              ...session,
              title: sessionTitleOverrides.get(session.id) ?? session.title,
            }));
      const query = (url.searchParams.get("q") ?? "").toLowerCase();
      return json({
        sessions:
          STUDY_STATE === "empty"
            ? []
            : records.filter((session) =>
                session.title.toLowerCase().includes(query),
              ),
      });
    }
    if (
      url.pathname === "/api/chat" &&
      request.method === "POST" &&
      STUDY_STATE === "busy"
    )
      return new Response(
        new ReadableStream({
          start(controller): void {
            for (const event of [
              { type: "start", messageId: "fixture-busy" },
              { type: "text-start", id: "text" },
              {
                type: "text-delta",
                id: "text",
                delta: "Fixture response remains in progress.",
              },
            ])
              controller.enqueue(
                new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`),
              );
          },
        }),
        {
          headers: {
            "content-type": "text/event-stream",
            "x-vercel-ai-ui-message-stream": "v1",
          },
        },
      );
    if (url.pathname === "/api/chat/uploads")
      return new Response("# Verdigris field notes\n", {
        headers: { "content-type": "text/markdown" },
      });
    if (url.pathname === "/api/chat/messages") {
      const id = url.searchParams.get("id");
      return json({
        messages:
          STUDY_STATE === "empty"
            ? []
            : id === "cards"
              ? cardMessages
              : id === "empty"
                ? []
                : messages,
      });
    }
    if (
      url.pathname === "/chat" ||
      url.pathname === "/studio" ||
      url.pathname.startsWith("/studio/entities/") ||
      url.pathname.startsWith("/studio/workspaces/")
    )
      return new Response(
        climateHtml(
          renderEditorShellHtml({
            assetPath: "/studio/assets/app.js",
            stylesheetPath: "/studio/assets/app.css",
            basePath: "/studio",
            sessionHref: "/logout",
            dashboardHref: "/dashboard",
            brandName: "Rover Collective",
            principal: { displayName: "Mira Reyes", role: "admin" },
          }),
          request,
        ),
        { headers: { "content-type": "text/html" } },
      );
    if (url.pathname.startsWith("/studio/assets/")) {
      const publicPath = url.pathname.slice("/studio/assets/".length);
      const filePath =
        publicPath === "app.js"
          ? "studio-app.js"
          : publicPath === "app.css"
            ? "studio-app.css"
            : publicPath;
      if (
        !/^(?:studio-app\.(?:js|css)|studio-app\.js\.map|studio-chunks\/[A-Za-z0-9_-]+\.(?:js|js\.map))$/.test(
          filePath,
        )
      ) {
        return new Response("Not found", { status: 404 });
      }
      return new Response(
        await readFile(path.join(studioUiDirectory, filePath)),
        {
          headers: {
            "content-type": filePath.endsWith(".map")
              ? "application/json"
              : filePath.endsWith(".css")
                ? "text/css"
                : "text/javascript",
          },
        },
      );
    }
    if (url.pathname === "/studio/api/types")
      return json({
        types: reviewingSystem
          ? [
              ...types.filter(
                (item) =>
                  !systemFixtures.has(item.entityType) &&
                  item.entityType !== "settings",
              ),
              ...systemTypes,
            ]
          : types,
        workspaces: [
          {
            id: "studio:overview",
            pluginId: "studio",
            label: "Overview",
            rendererName: "DeclarativeOperatorWorkspace",
            priority: -100,
            permission: "trusted",
            entityTypes: [],
            badge: await workViewFixtures.overviewBadge(),
          },
          {
            id: "web-chat:chat",
            pluginId: "studio",
            label: "Chat",
            rendererName: "StudioChatWorkspace",
            priority: -80,
            permission: "trusted",
            chatApiPath: "/api/chat",
            entityTypes: [],
          },
          {
            id: "unified-inbox:inbox",
            pluginId: "unified-inbox",
            label: "Inbox",
            rendererName: "DeclarativeOperatorWorkspace",
            priority: 20,
            permission: "admin",
            urlQuery: true,
            entityTypes: [],
            badge: 3,
          },
          {
            id: "content-pipeline:publishing",
            pluginId: "content-pipeline",
            label: "Publishing",
            rendererName: "DeclarativeOperatorWorkspace",
            priority: 40,
            permission: "trusted",
            urlQuery: true,
            entityTypes: [],
          },
          {
            id: "site-builder:site",
            pluginId: "site-builder",
            label: "Site",
            rendererName: "DeclarativeOperatorWorkspace",
            priority: 35,
            permission: "trusted",
            entityTypes: [],
          },
          {
            id: "directory-sync:sync",
            pluginId: "directory-sync",
            label: "Content sync",
            rendererName: "DeclarativeOperatorWorkspace",
            priority: 30,
            permission: "admin",
            entityTypes: [],
          },
          {
            id: "admin:administration",
            pluginId: "admin",
            label: "Administration",
            rendererName: "DeclarativeOperatorWorkspace",
            priority: 10,
            permission: "admin",
            urlQuery: true,
            entityTypes: [],
            badge: await administrationFixture.badge(),
          },
          {
            id: "studio:account",
            pluginId: "studio",
            label: "Account",
            rendererName: "StudioAccountWorkspace",
            priority: 0,
            permission: "public",
            entityTypes: [],
          },
        ],
      });
    if (
      url.pathname === "/studio/api/workspace" &&
      url.searchParams.get("id") === "studio:overview"
    )
      return json({
        workspace: {
          id: "studio:overview",
          rendererName: "DeclarativeOperatorWorkspace",
          data: await workViewFixtures.overview(),
        },
      });
    if (
      url.pathname === "/studio/api/workspace" &&
      url.searchParams.get("id") === "unified-inbox:inbox"
    )
      return json({
        workspace: {
          id: "unified-inbox:inbox",
          rendererName: "DeclarativeOperatorWorkspace",
          data: await workViewFixtures.inbox(
            Object.fromEntries(
              [...url.searchParams].filter(
                ([key]) => key !== "id" && key !== "climate",
              ),
            ),
          ),
        },
      });
    if (
      url.pathname === "/studio/api/workspace" &&
      url.searchParams.get("id") === "directory-sync:sync"
    )
      return json({
        workspace: {
          id: "directory-sync:sync",
          rendererName: "DeclarativeOperatorWorkspace",
          data: await syncViewFixture(),
        },
      });
    if (
      url.pathname === "/studio/api/workspace" &&
      url.searchParams.get("id") === "site-builder:site"
    )
      return json({
        workspace: {
          id: "site-builder:site",
          rendererName: "DeclarativeOperatorWorkspace",
          data: await deliveryViewFixtures.site(),
        },
      });
    if (
      url.pathname === "/studio/api/workspace" &&
      url.searchParams.get("id") === "content-pipeline:publishing"
    )
      return json({
        workspace: {
          id: "content-pipeline:publishing",
          rendererName: "DeclarativeOperatorWorkspace",
          data: await deliveryViewFixtures.publishing(),
        },
      });
    if (
      url.pathname === "/studio/api/workspace" &&
      url.searchParams.get("id") === "admin:administration"
    )
      return json({
        workspace: {
          id: "admin:administration",
          rendererName: "DeclarativeOperatorWorkspace",
          data: await administrationFixture.read(
            Object.fromEntries(
              [...url.searchParams].filter(
                ([key]) => key !== "id" && key !== "climate",
              ),
            ),
          ),
        },
      });
    if (url.pathname === "/auth/account")
      return json({
        account: {
          ...(STUDY_STATE === "empty"
            ? { profileEntityId: "anchor-profile/anchor-profile" }
            : {}),
          displayName: "Mira Reyes",
          role: "admin",
          connectedChannels:
            STUDY_STATE === "empty"
              ? []
              : [
                  {
                    type: "email",
                    label: "mira@example.com",
                    verifiedAt: 1_735_689_600_000,
                  },
                ],
          pluginSettings: [],
          passkeys: [
            {
              id: "passkey-1",
              credentialBackedUp: true,
              createdAt: 1_735_689_600_000,
              updatedAt: 1_735_689_600_000,
            },
          ],
          sessions: [
            {
              id: "session-current",
              current: true,
              createdAt: 1_735_689_600,
              expiresAt: 1_738_281_600,
            },
            {
              id: "session-tablet",
              current: false,
              createdAt: 1_735_776_000,
              expiresAt: 1_738_368_000,
            },
          ].slice(0, STUDY_STATE === "empty" ? 1 : undefined),
        },
      });
    const systemFixture = systemFixtures.get(
      url.searchParams.get("type") ?? "",
    );
    if (url.pathname === "/studio/api/schema" && systemFixture)
      return json({
        entityType: systemFixture.entityType,
        format: "frontmatter",
        isSingleton: systemFixture.isSingleton,
        hasBody: systemFixture.hasBody,
        fields: systemFixture.fields,
      });
    if (url.pathname === "/studio/api/schema")
      return json({
        entityType: "posts",
        format: "frontmatter",
        isSingleton: false,
        hasBody: true,
        fields: [
          { name: "title", label: "Title", widget: "string", required: true },
          { name: "slug", label: "Slug", widget: "string", required: false },
          {
            name: "summary",
            label: "Summary",
            widget: "text",
            required: false,
          },
          {
            name: "series",
            label: "Series",
            widget: "select",
            required: false,
            options: ["Trust & Identity", "Field Notes", "Infrastructure"],
          },
          {
            name: "topics",
            label: "Topics",
            widget: "list",
            required: false,
            field: { name: "topics", label: "Topics", widget: "string" },
          },
          {
            name: "published",
            label: "Published",
            widget: "boolean",
            required: false,
          },
          {
            name: "publishedAt",
            label: "Publish date",
            widget: "datetime",
            required: false,
          },
          {
            name: "coverImageId",
            label: "Cover image",
            widget: "image",
            required: false,
          },
        ],
      });
    if (url.pathname === "/studio/api/entities" && request.method === "PUT") {
      // Saves only happen in the secondary-state scenarios: an emptied
      // title pins the validation error line (studio-invalid), any other
      // save pins the reconcile card (studio-conflict).
      const body = (await request.json()) as {
        entityType?: string;
        frontmatter?: { title?: string; [key: string]: unknown };
        body?: string;
      };
      if (body.entityType && systemFixtures.has(body.entityType)) {
        lastSystemSave = body;
        const voice = body.frontmatter?.["voice"];
        if (isRecord(voice) && voice["summary"] === "!!")
          return Response.json(
            {
              error: "Validation failed",
              issues: [
                { path: ["voice", "summary"], message: "Review this summary." },
              ],
            },
            { status: 400 },
          );
        return json({
          entityId: body.entityType,
          jobId: "system-save",
          skipped: true,
        });
      }
      if (body.frontmatter?.title?.includes("!!"))
        return Response.json(
          {
            error: "Validation failed",
            issues: [
              { path: ["title"], message: "Title may not contain '!!'." },
            ],
          },
          { status: 400 },
        );
      return Response.json(
        {
          error:
            "The entry changed after you opened it — directory sync imported a newer version of this manuscript.",
        },
        { status: 409 },
      );
    }
    if (url.pathname === "/studio/api/upload") {
      const form = await request.formData();
      const file = form.get("file");
      if (file instanceof File && file.name === "retry-cover.png") {
        retryImageUploadFailed = !retryImageUploadFailed;
        return retryImageUploadFailed
          ? Response.json(
              { error: "Fixture upload interrupted" },
              { status: 503 },
            )
          : json({ entityId: "image/recovered-cover" });
      }
      // Hold the fixture at an observable in-flight boundary until its page
      // closes; teardown releases any request the browser did not abort.
      return new Promise<Response>((resolve) => {
        const release = (): void => {
          pendingUploadResponses.delete(release);
          resolve(json({ entityId: "image/verdigris-board" }));
        };
        pendingUploadResponses.add(release);
        request.signal.addEventListener("abort", release, { once: true });
      });
    }
    const hierarchyRequest = url.pathname === "/studio/api/hierarchy";
    if (
      (hierarchyRequest || url.pathname === "/studio/api/entities") &&
      systemFixture
    )
      return json(
        url.searchParams.has("id")
          ? { entity: systemFixture.entity }
          : {
              ...(hierarchyRequest ? { prefix: null, folders: [] } : {}),
              entities: [
                { ...systemFixture.entity, path: [systemFixture.entity.id] },
              ],
              total: 1,
            },
      );
    if (url.pathname === "/studio/api/entities" && url.searchParams.has("id"))
      return json({ entity });
    if (hierarchyRequest || url.pathname === "/studio/api/entities") {
      const offset = Number(url.searchParams.get("offset") ?? 0);
      const limit = Number(url.searchParams.get("limit") ?? 25);
      const query = (url.searchParams.get("q") ?? "").toLowerCase();
      const visibility = url.searchParams.get("visibility") ?? "all";
      const filtered = entities.filter(
        (item) =>
          item.frontmatter.title.toLowerCase().includes(query) &&
          (visibility === "all" || visibility === "public"),
      );
      if (url.searchParams.get("sort")?.endsWith("asc")) filtered.reverse();
      return json({
        ...(hierarchyRequest ? { prefix: null, folders: [] } : {}),
        // These fixtures have flat IDs; the real service owns hierarchy derivation.
        entities: filtered
          .slice(offset, offset + limit)
          .map((item) => ({ ...item, path: [item.id] })),
        total: filtered.length,
      });
    }
    if (url.pathname === "/studio/api/sync-status")
      return json({
        directorySync: { lastSync: "2026-07-11T16:32:00.000Z", watching: true },
        git: {
          branch: "main",
          hasChanges: false,
          ahead: 0,
          behind: 0,
          lastCommit: "3bfa1e6",
          remote: "origin",
        },
      });
    if (url.pathname === "/api/console/jump") return json({ groups: [] });
    return new Response("Not found", { status: 404 });
  },
});

const executablePath = process.env["CONSOLE_CHROMIUM_PATH"];
if (!executablePath) {
  await server.stop(true);
  await administrationFixture.dispose();
  throw new Error("Set CONSOLE_CHROMIUM_PATH to a Chromium executable.");
}
const browserArgs =
  process.getuid?.() === 0 || process.env["CI"] === "true"
    ? ["--no-sandbox", "--disable-dev-shm-usage"]
    : [];
const browserBackend: Bun.WebView.Backend = {
  type: "chrome",
  url: false,
  path: executablePath,
  ...(browserArgs.length > 0 ? { argv: browserArgs } : {}),
};
const failures: string[] = [];
async function settleVisualCapture(page: Bun.WebView): Promise<void> {
  await evaluatePage(page, async () => {
    await document.fonts.ready;
    const style = document.createElement("style");
    style.textContent =
      "*,*::before,*::after{animation-duration:0s!important;animation-delay:0s!important;transition-duration:0s!important;caret-color:transparent!important}";
    document.head.append(style);
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
  });
}
async function recordVisualCapture(name: string, image: Buffer): Promise<void> {
  const baselinePath = path.join(BASELINE_DIR, name);
  if (UPDATE) {
    const ratio = await comparePng(image, baselinePath).catch(() => 1);
    if (ratio > 0.002) await writeFile(baselinePath, image);
  } else {
    // Keep CI-native evidence even when small, intentional changes (for
    // example rail marks) fall below the whole-page comparison threshold.
    await writeFile(path.join(ARTIFACT_DIR, name), image);
    try {
      const ratio = await comparePng(image, baselinePath);
      if (ratio > 0.002) {
        failures.push(`${name}: ${(ratio * 100).toFixed(2)}% pixels changed`);
      }
    } catch (error) {
      failures.push(`${name}: ${getErrorMessage(error)}`);
    }
  }
}
try {
  for (const climate of CLIMATES) {
    if (CLIMATE_FILTER && climate !== CLIMATE_FILTER) continue;
    for (const viewport of VIEWPORTS) {
      if (
        VIEWPORT_FILTER &&
        `${viewport.width}x${viewport.height}` !== VIEWPORT_FILTER
      )
        continue;
      for (const surface of [
        "dashboard",
        "dashboard-knowledge",
        "dashboard-network",
        "chat",
        "chat-cards",
        "chat-empty",
        "chat-drawer",
        "studio-library",
        "studio-navigation",
        "studio-navigation-collapsed",
        "studio-overview",
        "studio-chat",
        "studio-chat-sessions",
        "studio-chat-context",
        "studio-inbox",
        "studio-content-sync",
        "studio-site",
        "studio-publishing",
        "studio-administration",
        "studio-administration-invitations",
        "studio-administration-invitations-form",
        "studio-administration-audit",
        "studio-account",
        "studio-editor",
        "studio-system",
        "studio-system-prompt-collection",
        "studio-system-agent-collection",
        ...[...systemFixtures.keys()]
          .filter((key) => key !== "style-guide")
          .map((key) => `studio-system-${key}`),
        "studio-delete",
        "studio-conflict",
        "studio-invalid",
        "studio-upload",
      ] as const) {
        if (SURFACE_FILTER && surface !== SURFACE_FILTER) continue;
        if (SURFACE_PREFIX && !surface.startsWith(SURFACE_PREFIX)) continue;
        if (STUDY_STATE && !supportsStudioStudyState(surface, STUDY_STATE))
          continue;
        // Guest Chat's drawer is mobile-only; Studio dialogs work at every width.
        if (surface === "chat-drawer" && viewport.width > 760) continue;
        // Secondary editor states are pinned at desktop and phone; tablet
        // adds no distinct composition for these overlays and lines.
        const isStudioSecondary =
          surface === "studio-delete" ||
          surface === "studio-conflict" ||
          surface === "studio-invalid" ||
          surface === "studio-upload";
        if (isStudioSecondary && viewport.width === 768) continue;
        console.error(
          `→ ${surface} ${viewport.width}x${viewport.height} ${climate}`,
        );
        reviewingSystem = surface.startsWith("studio-system");
        const systemCollection =
          reviewingSystem && surface.endsWith("-collection");
        const systemType =
          surface === "studio-system"
            ? "style-guide"
            : surface.slice(
                "studio-system-".length,
                systemCollection ? -"-collection".length : undefined,
              );
        const isChat = surface.startsWith("chat");
        const isDashboard = surface.startsWith("dashboard");
        const conversationId =
          surface === "chat-cards"
            ? "cards"
            : surface === "chat-empty"
              ? "empty"
              : "responsive";
        const page = new Bun.WebView({
          width: viewport.width,
          height: viewport.height,
          backend: browserBackend,
        });
        await page.navigate("about:blank");
        // Each capture starts from a fresh fixture preference. The browser backend
        // can reuse storage across WebViews; collapsed captures must not seed the next case.
        await page.cdp("Storage.clearDataForOrigin", {
          origin: `http://127.0.0.1:${server.port}`,
          storageTypes: "local_storage",
        });
        await page.cdp("Emulation.setLocaleOverride", { locale: "en-GB" });
        await page.cdp("Emulation.setTimezoneOverride", { timezoneId: "UTC" });
        await addVisualInitScript(page, conversationId);
        const isStudioEditor =
          surface === "studio-editor" ||
          (reviewingSystem && !systemCollection) ||
          isStudioSecondary;
        const studioSaveSelector = ".studio-editor-head-save";
        const route = isDashboard
          ? "/dashboard"
          : isChat
            ? "/ask"
            : surface === "studio-account"
              ? "/studio/workspaces/studio%3Aaccount"
              : surface === "studio-overview"
                ? "/studio/workspaces/studio%3Aoverview"
                : surface.startsWith("studio-chat")
                  ? "/chat"
                  : surface === "studio-inbox"
                    ? "/studio/workspaces/unified-inbox%3Ainbox"
                    : surface === "studio-content-sync"
                      ? "/studio/workspaces/directory-sync%3Async"
                      : surface === "studio-site"
                        ? "/studio/workspaces/site-builder%3Asite"
                        : surface === "studio-publishing"
                          ? "/studio/workspaces/content-pipeline%3Apublishing"
                          : surface.startsWith("studio-administration")
                            ? "/studio/workspaces/admin%3Aadministration"
                            : surface.startsWith("studio-system")
                              ? `/studio/entities/${systemType}${systemCollection ? "" : `/${systemType}`}`
                              : isStudioEditor
                                ? "/studio/entities/posts/field-notes"
                                : "/studio/entities/posts";
        const hash = isChat ? `#s/${conversationId}` : "";
        const workspaceQuery = surface.startsWith(
          "studio-administration-invitations",
        )
          ? `&tab=invitations`
          : surface === "studio-administration-audit"
            ? `&tab=audit`
            : surface.startsWith("studio-chat") && STUDY_STATE !== "empty"
              ? `&session=responsive`
              : "";
        await navigateToNetworkIdle(
          page,
          `http://127.0.0.1:${server.port}${route}?climate=${climate}${workspaceQuery}${hash}`,
        );
        const emptySystemDocument =
          reviewingSystem &&
          !systemCollection &&
          systemFixtures.get(systemType)?.hasBody &&
          systemFixtures.get(systemType)?.entity.body.trim() === "";
        if (emptySystemDocument)
          await waitForPage(
            "Properties visible when the document has no body",
            () =>
              evaluatePage(
                page,
                () =>
                  document.querySelector<HTMLDetailsElement>(
                    "details[data-studio-properties]",
                  )?.open === true,
              ),
          );
        if (STUDY_STATE) {
          await settleVisualCapture(page);
          const emptyCopy: Record<string, string> = {
            "studio-overview": "Nothing needs your attention.",
            "studio-chat":
              "No messages yet. Your draft stays in the composer until you send it.",
            "studio-inbox": "Nothing needs attention for these filters.",
            "studio-publishing": "Nothing is in flight",
            "studio-site": "Not published yet",
            "studio-content-sync": "No directory sync runs have completed yet.",
            "studio-administration-invitations": "No pending invitations.",
            "studio-administration-audit":
              "No audit events match these filters.",
            "studio-account": "Managed by the Anchor profile",
          };
          if (STUDY_STATE === "empty") {
            const expected = emptyCopy[surface];
            if (!expected)
              throw Error(`No empty-state assertion for ${surface}`);
            await waitForText(page, expected);
            if (surface === "studio-overview")
              await waitForText(page, "No recent activity is available.");
            if (surface === "studio-inbox")
              await waitForText(
                page,
                "Change Source or Urgency to inspect other incoming work.",
              );
            if (surface === "studio-site")
              await evaluatePage(page, () => {
                if (
                  Array.from(document.querySelectorAll("a")).some(
                    (a) => a.textContent.trim() === "Open preview",
                  )
                )
                  throw Error(
                    "An absent configured URL must not produce an open link",
                  );
              });
            if (surface === "studio-publishing")
              await evaluatePage(page, () => {
                if (document.querySelector('[role="tablist"]'))
                  throw Error("Rest state must not retain an empty queue tab");
              });
            if (surface === "studio-account")
              await evaluatePage(page, () => {
                const buttons = Array.from(document.querySelectorAll("button"));
                if (
                  buttons.some(
                    (b) =>
                      b.textContent.trim() === "Save name" ||
                      b.textContent.trim() === "Revoke",
                  )
                )
                  throw Error("Anchor/final-passkey protections lost");
                const endOthers = buttons.find(
                  (b) => b.textContent.trim() === "End other sessions",
                );
                if (!endOthers?.disabled)
                  throw Error(
                    "End other sessions must be disabled with only the current session",
                  );
              });
          } else if (STUDY_STATE === "busy" && surface === "studio-chat") {
            await waitForText(page, "Message");
            await fillLabel(page, "Message", "Continue the current review");
            await clickText(page, "button", "Send");
            await waitForText(page, "Fixture response remains in progress.");
            await waitForText(page, "Stop");
          } else if (STUDY_STATE === "busy") {
            await waitForText(page, "Build preview");
            await waitForText(page, "Published generation");
            await evaluatePage(page, () => {
              const build = Array.from(
                document.querySelectorAll("button"),
              ).find((b) => b.textContent.trim() === "Build preview");
              if (!build?.disabled)
                throw Error(
                  "Active build must disable a duplicate preview request",
                );
            });
          } else if (STUDY_STATE === "outage")
            await waitForText(
              page,
              "Unavailable sources are not an all-clear.",
            );
          else if (STUDY_STATE === "failure") {
            await waitForText(page, "The latest completed build failed");
            await waitForText(page, "Published generation");
            await evaluatePage(page, () => {
              const panel = document.querySelector('[role="tabpanel"]');
              const notice = panel?.querySelector('aside[data-tone="warn"]');
              if (
                !panel ||
                !notice ||
                Math.abs(
                  panel.getBoundingClientRect().width -
                    notice.getBoundingClientRect().width,
                ) > 2
              )
                throw Error(
                  "Build failure must span the environment before its supporting columns",
                );
              const next = notice.closest("section")?.nextElementSibling;
              if (
                !next ||
                next.getBoundingClientRect().top -
                  notice.getBoundingClientRect().bottom <
                  24
              )
                throw Error("Adjacent tab blocks need shared section spacing");
            });
          } else if (STUDY_STATE === "restart") {
            await waitForText(page, "Needs you");
            await waitForText(page, "Recent activity");
            await waitForText(page, "No recent autonomous activity.");
          } else await waitForText(page, "unexpected-native-status");
          await checkLayout(page, surface, viewport.width, viewport.height);
          await auditStudioAccessibility(
            page,
            `${surface}-${STUDY_STATE}-${viewport.width}x${viewport.height}-${climate}`,
          );
          await recordVisualCapture(
            `${surface}-${STUDY_STATE}-${viewport.width}x${viewport.height}-${climate}.png`,
            await page.screenshot({ encoding: "buffer", format: "png" }),
          );
          if (STUDY_STATE === "failure" || STUDY_STATE === "dense") {
            await clickText(page, "button", "View diagnostics");
            await waitForSelector(page, '[role="dialog"]');
            await waitForText(
              page,
              STUDY_STATE === "failure"
                ? "Exact diagnostic reference: fixture-preview-failed"
                : "Exact retained diagnostic:",
            );
            await evaluatePage(page, () => {
              const dialog = document.querySelector('[role="dialog"]');
              if (!dialog || dialog.scrollWidth > dialog.clientWidth + 1)
                throw Error("Expanded diagnostics overflow");
              const close = dialog
                .querySelector('[data-slot="dialog-close"]')
                ?.getBoundingClientRect();
              if (
                innerWidth <= 640 &&
                (!close || close.width < 44 || close.height < 44)
              )
                throw Error(
                  "Phone disclosure close target must be at least 44px",
                );
            });
            await recordVisualCapture(
              `${surface}-${STUDY_STATE}-expanded-${viewport.width}x${viewport.height}-${climate}.png`,
              await page.screenshot({ encoding: "buffer", format: "png" }),
            );
            if (STUDY_STATE === "failure") {
              await evaluatePage(page, () => {
                const source = document.querySelector('[role="dialog"] pre');
                if (
                  !(source instanceof HTMLElement) ||
                  !source.textContent.includes(
                    "Retained renderer diagnostic.\n".repeat(180),
                  ) ||
                  !source.textContent.endsWith(
                    "Exact diagnostic reference: fixture-preview-failed",
                  )
                )
                  throw Error("Build diagnostics were truncated");
                source.scrollTop = source.scrollHeight;
              });
              await recordVisualCapture(
                `${surface}-${STUDY_STATE}-expanded-end-${viewport.width}x${viewport.height}-${climate}.png`,
                await page.screenshot({ encoding: "buffer", format: "png" }),
              );
            }
            await clickSelector(page, '[role="dialog"] [aria-label="Close"]');
          }
          if (STUDY_STATE === "dense") {
            await clickText(page, "summary", "Repository details");
            await evaluatePage(page, () => {
              const repository = Array.from(
                document.querySelectorAll("details[open]"),
              ).find((n) =>
                n
                  .querySelector("summary")
                  ?.textContent.includes("Repository details"),
              );
              if (
                !repository ||
                !repository.textContent.includes("abcdef123456") ||
                !document.body.textContent.includes(
                  `notes/${"nested-directory/".repeat(8)}record-35.md`,
                ) ||
                !document.body.textContent.includes("unexpected-native-status")
              )
                throw Error("Dense repository source records were lost");
              if (repository.scrollWidth > repository.clientWidth + 1)
                throw Error("Dense repository overflows");
              repository.scrollIntoView({ block: "start" });
              window.scrollBy(0, -64);
            });
            await recordVisualCapture(
              `${surface}-${STUDY_STATE}-repository-${viewport.width}x${viewport.height}-${climate}.png`,
              await page.screenshot({ encoding: "buffer", format: "png" }),
            );
            await evaluatePage(page, () => {
              const row = Array.from(document.querySelectorAll("main li")).find(
                (n) => n.textContent.includes("unexpected-native-status"),
              );
              if (!row || row.scrollWidth > row.clientWidth + 1)
                throw Error("Dense source record missing or overflowing");
              row.scrollIntoView({ block: "center" });
            });
            await recordVisualCapture(
              `${surface}-${STUDY_STATE}-records-${viewport.width}x${viewport.height}-${climate}.png`,
              await page.screenshot({ encoding: "buffer", format: "png" }),
            );
          }
          if (STUDY_STATE === "busy" && surface === "studio-chat") {
            await clickText(page, "button", "Stop");
            await waitForText(page, "Send");
            await waitForText(page, "Fixture response remains in progress.");
          }
          console.log(
            `✓ ${surface} ${STUDY_STATE} ${viewport.width}px ${climate}: source state, layout and protections pass`,
          );
          page.close();
          continue;
        }
        if (
          surface === "studio-system" &&
          viewport.width <= 640 &&
          climate === "instrument"
        ) {
          for (const label of ["Preview", "Source"]) {
            await evaluatePage(page, () => {
              document
                .querySelector('[aria-label="Editor body view"]')
                ?.scrollIntoView({ block: "center" });
            });
            await activateWorkspaceTab(page, label);
            await waitForPage(`inline ${label} mode`, () =>
              evaluatePageWith(
                page,
                (expected) => {
                  const selected = document.querySelector(
                    '[aria-label="Editor body view"] [aria-selected="true"]',
                  );
                  return selected?.textContent.trim() === expected;
                },
                label,
              ),
            );
            if (!(await elementBounds(page, "[data-studio-properties]")))
              throw new Error(
                "Body mode changes must not hide System Properties",
              );
          }
          await evaluatePage(page, () => {
            const content = document.querySelector<HTMLElement>(
              "[data-studio-editor-content]",
            );
            if (content) content.scrollTop = 0;
          });
        }
        if (surface.startsWith("studio-navigation")) {
          if (viewport.width > 900) {
            await clickSelector(page, ".studio-navigation-collapse");
            await waitForPage("collapsed shell width", () =>
              page.evaluate<boolean>(
                'Math.round(document.querySelector(".rail").getBoundingClientRect().width) === 68 && getComputedStyle(document.querySelector(".studio-leaf-rail")).display === "none"',
              ),
            );
            const currentPath =
              await page.evaluate<string>("location.pathname");
            await clickText(page, ".studio-area-link", "Work");
            if (
              (await page.evaluate<string>("location.pathname")) !== currentPath
            ) {
              throw new Error(
                "Browsing Work navigated away from the current document",
              );
            }
            await waitForSelector(
              page,
              '.studio-leaf-rail[aria-label="Work destinations"]',
            );
            await waitForPage("area click expands shell", () =>
              page.evaluate<boolean>(
                'Math.round(document.querySelector(".rail").getBoundingClientRect().width) === 344',
              ),
            );
            if (surface.endsWith("-collapsed"))
              await clickSelector(page, ".studio-navigation-collapse");
          } else {
            await clickSelector(page, ".studio-mobile-switcher");
            await waitForSelector(page, ".studio-mobile-navigation-sheet");
            if (surface.endsWith("-collapsed"))
              await clickText(
                page,
                ".studio-mobile-navigation-group summary",
                "Library",
              );
          }
        }
        if (
          surface === "studio-overview" &&
          viewport.width <= 640 &&
          climate === "instrument"
        ) {
          await verifyStudioMobileSwitcher(page);
        }
        if (surface.startsWith("studio-chat")) {
          await waitForText(page, "And the Studio?");
          await waitForSelector(page, ".studio-chat-upload");
          if (surface === "studio-chat") {
            await clickSelector(
              page,
              '[aria-label="Conversation details and options"]',
            );
            await waitForSelector(page, '[role="dialog"]');
            await clickText(page, "button", "Rename");
            await fillLabel(
              page,
              "Conversation title",
              "Reviewed conversation",
            );
            await clickText(page, ".studio-chat-rename button", "Save title");
            await waitForText(page, "Reviewed conversation");
            await clickText(page, "button", "Rename");
            await fillLabel(
              page,
              "Conversation title",
              "Responsive console audit",
            );
            await clickText(page, ".studio-chat-rename button", "Save title");
            await waitForText(page, "Responsive console audit");
            await clickSelector(
              page,
              '[role="dialog"] [data-slot="dialog-close"]',
            );
          }
          if (surface === "studio-chat") {
            await clickSelector(
              page,
              ".studio-chat-session-picker-trigger button",
            );
            await waitForSelector(
              page,
              '[role="dialog"] .studio-chat-session-picker',
            );
            await fillLabel(page, "Search conversations", "Verdigris");
            await waitForPage("session search filters results", () =>
              evaluatePage(
                page,
                () =>
                  document.querySelectorAll(
                    '[role="dialog"] .studio-chat-session',
                  ).length === 1,
              ),
            );
            await fillLabel(page, "Search conversations", "");
            await clickText(
              page,
              ".studio-collection-controls summary",
              "Filter",
            );
            await verifyCollectionFiltersFit(page);
            await waitForPage("unfiltered conversation collection", () =>
              page.evaluate<boolean>(
                'document.querySelector(".studio-chat-session-list")?.textContent?.includes("Responsive console audit") ?? false',
              ),
            );
            await settleVisualCapture(page);
            const filtersName = `studio-chat-filters-${viewport.width}x${viewport.height}-${climate}`;
            await auditStudioAccessibility(page, filtersName);
            await recordVisualCapture(
              `${filtersName}.png`,
              await page.screenshot({ encoding: "buffer", format: "png" }),
            );
            await evaluatePage(page, () => {
              const select = document.querySelector<HTMLSelectElement>(
                '[role="dialog"] select',
              );
              if (!select) throw new Error("Missing archive selector");
              select.value = "archived";
              select.dispatchEvent(new Event("change", { bubbles: true }));
            });
            await waitForText(page, "Archived review");
            await evaluatePage(page, () => {
              const select = document.querySelector<HTMLSelectElement>(
                '[role="dialog"] select',
              );
              if (!select) throw new Error("Missing archive selector");
              select.value = "active";
              select.dispatchEvent(new Event("change", { bubbles: true }));
            });
            await waitForText(page, "Responsive console audit");
            await clickText(
              page,
              ".studio-chat-session-picker .studio-chat-session",
              "Responsive console audit",
            );
            let restored = false;
            for (let attempt = 0; attempt < 30; attempt++) {
              restored = await evaluatePage(
                page,
                () =>
                  !document.querySelector('[role="dialog"]') &&
                  document.activeElement?.matches(
                    ".studio-chat-session-picker-trigger button",
                  ) === true,
              );
              if (restored) break;
              await Bun.sleep(25);
            }
            if (!restored)
              throw new Error(
                "Session selection did not close the dialog and restore focus",
              );
          }
          if (surface === "studio-chat-sessions") {
            await clickText(
              page,
              ".studio-chat-session-picker-trigger button",
              "History",
            );
          }
          if (surface === "studio-chat") {
            await fillLabel(
              page,
              "Message",
              "Keep this draft while reading context",
            );
            const height = await evaluatePage(
              page,
              () =>
                document.querySelector(".studio-chat-thread-scroll")
                  ?.clientHeight,
            );
            await clickSelector(
              page,
              '[aria-label="Conversation details and options"]',
            );
            await waitForSelector(page, ".studio-chat-details");
            await evaluatePageWith(
              page,
              (previousHeight) => {
                if (
                  document.querySelector(".studio-chat-thread-scroll")
                    ?.clientHeight !== previousHeight
                )
                  throw new Error("Details squeezed the conversation");
                if (
                  document.querySelectorAll(".studio-chat-context").length !== 1
                )
                  throw new Error("Context duplicated");
              },
              height,
            );
            await clickSelector(
              page,
              '[role="dialog"] [data-slot="dialog-close"]',
            );
            await waitForPage("Details focus restoration", () =>
              evaluatePage(
                page,
                () =>
                  document.activeElement?.getAttribute("aria-label") ===
                  "Conversation details and options",
              ),
            );
            await evaluatePage(page, () => {
              if (
                document.querySelector<HTMLTextAreaElement>(
                  ".studio-chat-message",
                )?.value !== "Keep this draft while reading context"
              )
                throw new Error("Details lost draft");
            });
            await fillLabel(page, "Message", "");
          }
          if (surface === "studio-chat-context") {
            await clickSelector(
              page,
              '[aria-label="Conversation details and options"]',
            );
            await waitForSelector(page, ".studio-chat-details");
            await clickText(
              page,
              ".studio-chat-details summary",
              "Sources and attachments",
            );
          }
        }

        if (isDashboard) {
          await verifyDashboardChrome(page);
          await verifyDashboardSummary(page);
          if (surface === "dashboard") {
            const previousHash = await evaluatePage(
              page,
              () => window.location.hash,
            );
            await clickSelector(page, '[data-dashboard-tab-link="system"]');
            await evaluatePage(page, async () => {
              await document.fonts.ready;
              window.scrollTo(0, 0);
            });
            await writeFile(
              path.join(
                ARTIFACT_DIR,
                `dashboard-system-${viewport.width}x${viewport.height}-${climate}.png`,
              ),
              await page.screenshot({ encoding: "buffer", format: "png" }),
            );
            if (viewport.width <= 700) {
              await evaluatePage(page, () =>
                document
                  .querySelector(".system-checks-card")
                  ?.scrollIntoView({ block: "start" }),
              );
              await writeFile(
                path.join(
                  ARTIFACT_DIR,
                  `dashboard-system-checks-${viewport.width}x${viewport.height}-${climate}.png`,
                ),
                await page.screenshot({ encoding: "buffer", format: "png" }),
              );
            }
            if (viewport.width <= 960) {
              await evaluatePage(page, () =>
                document
                  .querySelector(".system-runtime-card")
                  ?.scrollIntoView({ block: "start" }),
              );
              await writeFile(
                path.join(
                  ARTIFACT_DIR,
                  `dashboard-system-reference-${viewport.width}x${viewport.height}-${climate}.png`,
                ),
                await page.screenshot({ encoding: "buffer", format: "png" }),
              );
            }
            await clickSelector(page, '[data-dashboard-tab-link="overview"]');
            await evaluatePageWith(
              page,
              (hash) => {
                window.history.replaceState(
                  null,
                  "",
                  window.location.pathname + window.location.search + hash,
                );
                window.scrollTo(0, 0);
              },
              previousHash,
            );
          }
        }
        if (
          surface === "dashboard-knowledge" ||
          surface === "dashboard-network"
        ) {
          const tab =
            surface === "dashboard-knowledge" ? "knowledge" : "network";
          await clickSelector(page, `[data-dashboard-tab-link="${tab}"]`);
          await evaluatePage(page, () => window.scrollTo(0, 0));
        }
        if (surface === "chat" || surface === "chat-drawer") {
          await waitForText(page, "And the Studio?");
          await waitForSelector(page, ".web-chat-attached-file");
        }
        if (surface === "chat-empty") {
          await waitForText(page, "Begin a field note.");
        }
        if (surface === "chat-drawer") {
          await clickSelector(page, ".web-chat-mobile-trigger");
          // The drawer slides in over 0.3s; wait for the transform to land.
          await evaluatePageWith(
            page,
            (selector) =>
              new Promise<void>((resolve) => {
                const node = document.querySelector(selector);
                if (!(node instanceof HTMLElement)) {
                  throw new Error(`Missing drawer ${selector}`);
                }
                const check = (): void => {
                  const { left } = node.getBoundingClientRect();
                  if (Math.abs(left) < 0.5) resolve();
                  else requestAnimationFrame(check);
                };
                check();
              }),
            ".web-chat-sessions",
          );
        }
        if (surface === "chat-cards") {
          await waitForText(page, "Queued for the trust series.");
          // Cards ship collapsed; the baselines pin their expanded bodies.
          await evaluatePage(page, () => {
            for (const details of Array.from(
              document.querySelectorAll("details"),
            )) {
              details.open = true;
            }
          });
          await evaluatePage(page, () =>
            Promise.all(
              Array.from(document.images)
                .filter((image) => !image.complete)
                .map(
                  (image) =>
                    new Promise((resolve) => {
                      image.addEventListener("load", resolve, { once: true });
                      image.addEventListener("error", resolve, { once: true });
                    }),
                ),
            ),
          );
          // Fonts must settle before pinning scroll — a late swap reflows
          // the thread and shifts the captured scroll position.
          await evaluatePage(page, () => document.fonts.ready);
          // Pin the end of the exchange: scroll every scrollable ancestor
          // of the final message to its bottom, and repeat until the
          // positions survive a frame — the thread's stick-to-bottom
          // spring keeps animating past the first pin.
          const pinConversationEnd = (): number[] => {
            const marker = Array.from(document.querySelectorAll("p"))
              .reverse()
              .find((node) =>
                node.textContent.includes("Queued for the trust series"),
              );
            const tops: number[] = [];
            let node: HTMLElement | null = marker ?? null;
            while (node) {
              if (node.scrollHeight > node.clientHeight + 4) {
                node.scrollTop = node.scrollHeight;
                tops.push(node.scrollTop);
              }
              node = node.parentElement;
            }
            return tops;
          };
          let previousTops = "";
          for (let attempt = 0; attempt < 10; attempt += 1) {
            const tops = JSON.stringify(
              await evaluatePage(page, pinConversationEnd),
            );
            await evaluatePage(
              page,
              () =>
                new Promise<void>((resolve) =>
                  requestAnimationFrame(() =>
                    requestAnimationFrame(() => resolve()),
                  ),
                ),
            );
            const settled = JSON.stringify(
              await evaluatePage(page, pinConversationEnd),
            );
            if (settled === tops && settled === previousTops) break;
            previousTops = settled;
          }
        }
        if (surface === "studio-library") {
          await waitForText(page, "1–25 of 54");
          await clickText(page, ".listing-pagination button", "Next");
          await waitForText(page, "26–50 of 54");
          await waitForText(page, "Archive note 22");
          await clickText(page, ".listing-pagination button", "Previous");
          await waitForText(page, "A console that travels well");
          await waitForText(page, "1–25 of 54");
          await clickText(page, ".listing-pagination button", "Next");
          await fillLabel(page, "Search title or content", "Archive note 22");
          await waitForText(page, "1–1 of 1");
          await evaluatePage(page, () => {
            if (new URLSearchParams(location.search).has("offset"))
              throw new Error("Searching must reset collection offset");
          });
          await clickText(
            page,
            ".studio-collection-controls summary",
            "Filter and sort",
          );
          await verifyCollectionFiltersFit(page);
          await settleVisualCapture(page);
          const filtersName = `studio-library-filters-${viewport.width}x${viewport.height}-${climate}`;
          await auditStudioAccessibility(page, filtersName);
          await recordVisualCapture(
            `${filtersName}.png`,
            await page.screenshot({ encoding: "buffer", format: "png" }),
          );
          await evaluatePage(page, () => {
            const select = document.querySelector<HTMLSelectElement>(
              ".studio-collection-controls select",
            );
            if (!select) throw new Error("Visibility filter missing");
            select.value = "restricted";
            select.dispatchEvent(new Event("change", { bubbles: true }));
          });
          await waitForText(page, "No entries match these filters");
          await clickText(page, ".studio-collection-controls button", "Clear");
          await waitForText(page, "1–25 of 54");
          await evaluatePage(page, () => history.back());
          await waitForText(page, "No entries match these filters");
          await evaluatePage(page, () => history.forward());
          await waitForText(page, "1–25 of 54");
          await evaluatePage(page, () => {
            const details = document.querySelector<HTMLDetailsElement>(
              ".studio-collection-controls details",
            );
            if (details) details.open = false;
          });
        }
        if (surface === "studio-overview") {
          await waitForText(page, "Recent activity");
        }
        if (surface === "studio-content-sync") {
          await waitForText(page, "Recent runs");
          await waitForText(page, "Connection");
          await waitForText(page, "Repository sync needs attention");
          await clickText(page, "button", "View diagnostics");
          await waitForSelector(page, '[role="dialog"]');
          await evaluatePage(page, () => {
            const dialog = document.querySelector('[role="dialog"]');
            for (const record of [
              "git push origin main exited with 1",
              "git pull origin main exited with 1",
              "Occurred: 2026-07-11T09:15:00.000Z",
              "Occurred: 2026-07-11T09:14:30.000Z",
            ]) {
              if (!dialog?.textContent.includes(record))
                throw new Error(
                  "Sync diagnostics lost a recorded operation or timestamp",
                );
            }
          });
          await clickSelector(page, '[role="dialog"] [aria-label="Close"]');
          await waitForPage("sync diagnostics closed", () =>
            evaluatePage(
              page,
              () => !document.querySelector('[role="dialog"]'),
            ),
          );
          await clickText(page, "summary", "Repository details");
          await evaluatePage(page, () => {
            const repository = [
              ...document.querySelectorAll("details[open]"),
            ].find((node) =>
              node
                .querySelector("summary")
                ?.textContent.includes("Repository details"),
            );
            if (!repository)
              throw new Error("Missing expanded repository facts");
            const labels = [...repository.querySelectorAll("dt")].map(
              (node) => node.textContent,
            );
            for (const label of [
              "Content files",
              "Issues",
              "Commits ahead",
              "Commits behind",
              "Commit debounce",
            ])
              if (labels.filter((value) => value === label).length !== 1)
                throw new Error(
                  `Repository fact missing or repeated: ${label}`,
                );
            if (!repository.textContent.includes("abcdef123456"))
              throw new Error(
                "Repository details lost the exact commit identifier",
              );
            repository.scrollIntoView({ block: "start" });
            window.scrollBy(0, -64);
          });
          await evaluatePage(page, async () => {
            await document.fonts.ready;
          });
          await writeFile(
            path.join(
              ARTIFACT_DIR,
              `studio-content-sync-repository-${viewport.width}x${viewport.height}-${climate}.png`,
            ),
            await page.screenshot({ encoding: "buffer", format: "png" }),
          );
          await clickText(page, "summary", "Repository details");
          await evaluatePage(page, () => {
            let node: HTMLElement | null =
              [...document.querySelectorAll<HTMLElement>("summary")].find(
                (item) => item.textContent.includes("Repository details"),
              ) ?? null;
            while (node) {
              node.scrollTop = 0;
              node = node.parentElement;
            }
          });
        }
        if (surface === "studio-site") {
          await waitForText(page, "Build preview");
          await evaluatePage(page, () => {
            const controls = document.querySelector("[data-card-controls]");
            const link = controls?.querySelector("a");
            if (link?.getAttribute("href") !== "https://preview.example.com")
              throw new Error("Published state lost its preview link");
            if (
              window.innerWidth <= 640 &&
              link.getBoundingClientRect().height < 44
            )
              throw new Error("Preview link lost its phone touch target");
            for (const details of document.querySelectorAll(
              ".declarative-card:is(details)",
            ))
              if (details.hasAttribute("open"))
                throw new Error("Supporting Site details should start folded");
          });
          await clickText(page, "summary", "Render details");
          await waitForPage("retained render details", () =>
            evaluatePage(page, () =>
              [...document.querySelectorAll("details[open]")].some(
                (node) =>
                  node.textContent.includes("Last successful render") &&
                  node.textContent.includes("build-20260711163352-preview"),
              ),
            ),
          );
          await clickText(page, "summary", "Render details");
          await clickText(page, "summary", "Configured routes");
          await evaluatePage(page, () => {
            const routes = [...document.querySelectorAll("details[open]")].find(
              (node) => node.textContent.includes("Configured routes"),
            );
            if (
              routes?.querySelectorAll("tbody tr").length !== 8 ||
              !routes.textContent.includes("23 further routes")
            )
              throw new Error(
                "Configured routes lost their bounded preview or remainder",
              );
          });
          await clickText(page, "summary", "Configured routes");
          await activateWorkspaceTab(page, "Production");
          await waitForText(page, "Build production");
          await clickText(page, "button", "Build production");
          await waitForText(page, "Build and publish the production site now?");
          await clickText(
            page,
            '[role="dialog"] button, [role="alertdialog"] button',
            "Cancel",
          );
          await waitForText(page, "Published generation");
          await activateWorkspaceTab(page, "Preview");
          await waitForText(page, "Build preview");
        }
        if (surface === "studio-publishing") {
          await waitForText(page, "Notes from the rhizome");
          await evaluatePage(page, () => {
            if (
              !document
                .querySelector("[data-studio-page-head]")
                ?.textContent.includes("14 published") ||
              document.querySelector('[data-block-id="publishing-summary"]')
            )
              throw Error(
                "Published totals belong in the page head, not a separate body panel",
              );
          });
          await evaluatePage(page, () => {
            const attention = document.querySelector(
              'section[data-tone="warn"]',
            );
            if (
              !attention ||
              document.querySelector('[role="dialog"]') ||
              !attention
                .querySelector("header")
                ?.textContent.includes("Retries: 1") ||
              !attention
                .querySelector("h2")
                ?.textContent.includes("One delivery needs attention")
            )
              throw new Error(
                "Publishing attention is missing or exposes its controls at rest",
              );
          });
          await clickText(page, "button", "Review failure");
          await waitForSelector(page, '[role="dialog"]');
          await evaluatePage(page, () => {
            const attention = document.querySelector('[role="dialog"]');
            const retry = [
              ...(attention?.querySelectorAll("button") ?? []),
            ].find((button) =>
              button.textContent.includes("Retry publication"),
            );
            if (
              !attention?.textContent.includes(
                "Provider rejected the last delivery attempt.",
              ) ||
              !retry ||
              retry.disabled
            )
              throw new Error(
                "Publication review lost diagnostics or its retry action",
              );
          });
          await clickSelector(page, '[role="dialog"] [aria-label="Close"]');
          await waitForPage("failure review closed", () =>
            evaluatePage(
              page,
              () => !document.querySelector('[role="dialog"]'),
            ),
          );
          await clickText(page, "button", "Queue options");
          await waitForSelector(page, '[role="dialog"]');
          await evaluatePage(page, () => {
            const buttons = [
              ...document.querySelectorAll<HTMLButtonElement>(
                '[role="dialog"] button',
              ),
            ];
            for (const label of ["Move up", "Move down"]) {
              const button = buttons.find((node) =>
                node.textContent.includes(label),
              );
              if (!button?.disabled)
                throw new Error(
                  "Single-item destination must retain disabled reorder boundaries",
                );
            }
            if (
              !buttons.some(
                (button) =>
                  button.textContent.includes("Remove from queue") &&
                  !button.disabled,
              )
            )
              throw new Error("Queue options lost removal");
          });
          await clickSelector(page, '[role="dialog"] [aria-label="Close"]');
          await waitForPage("queue options closed", () =>
            evaluatePage(
              page,
              () => !document.querySelector('[role="dialog"]'),
            ),
          );
          await activateWorkspaceTab(page, "Generating (1)");
          await waitForText(page, "og-image");
          await activateWorkspaceTab(page, "Queued (3)");
          await waitForText(page, "Quiet infrastructure");
        }
        if (
          surface === "studio-content-sync" ||
          surface === "studio-inbox" ||
          surface === "studio-overview"
        )
          await verifyRecordTypography(page);
        if (surface === "studio-account") {
          await waitForText(page, "Signed-in sessions");
        }
        if (surface === "studio-administration-invitations-form") {
          await clickSelector(page, ".declarative-action-disclosure");
        }
        if (surface === "studio-delete") {
          // Open the delete confirmation. Phone tucks the control behind
          // the ••• disclosure; wider widths show it in the pipeline bar.
          if (viewport.width <= 640) {
            await pointerDownSelector(
              page,
              'button[aria-label="More document actions"]',
            );
            await clickSelector(page, '[role="menuitem"]');
          } else {
            await clickSelector(
              page,
              '[data-studio-save-bar] [data-slot="button"][data-variant="danger"]',
            );
          }
          await waitForSelector(page, ".delete-modal");
        }
        if (surface === "studio-editor") {
          if (viewport.width <= 640) {
            await pointerDownSelector(page, ".studio-mobile-tabs button");
            await clickText(page, '[role="menuitem"]', "Preview");
            await waitForSelector(page, '[data-mobile-pane="preview"]');
          }
          await evaluatePage(page, () => {
            const keyword = document.querySelector<HTMLElement>(
              '[data-code-token="keyword"]',
            );
            const plain = document.querySelector<HTMLElement>(
              '[data-code-token="plain"]',
            );
            if (
              !keyword ||
              !plain ||
              getComputedStyle(keyword).color === getComputedStyle(plain).color
            )
              throw new Error("Code tokens lost theme-aware highlighting");
            const canvas = document.createElement("canvas");
            canvas.width = canvas.height = 1;
            const context = canvas.getContext("2d", {
              willReadFrequently: true,
            });
            if (!context) throw new Error("Cannot measure syntax contrast");
            const luminance = (pixel: Uint8ClampedArray): number => {
              const linear = (index: number): number => {
                const value = (pixel[index] ?? 0) / 255;
                return value <= 0.04045
                  ? value / 12.92
                  : ((value + 0.055) / 1.055) ** 2.4;
              };
              return (
                0.2126 * linear(0) + 0.7152 * linear(1) + 0.0722 * linear(2)
              );
            };
            for (const token of document.querySelectorAll<HTMLElement>(
              "[data-code-token]",
            )) {
              const ancestors: Element[] = [];
              for (
                let node: Element | null = token;
                node;
                node = node.parentElement
              )
                ancestors.unshift(node);
              context.clearRect(0, 0, 1, 1);
              context.fillStyle =
                getComputedStyle(token).getPropertyValue("--console-bg");
              context.fillRect(0, 0, 1, 1);
              for (const ancestor of ancestors) {
                context.fillStyle = getComputedStyle(ancestor).backgroundColor;
                context.fillRect(0, 0, 1, 1);
              }
              const background = luminance(
                context.getImageData(0, 0, 1, 1).data,
              );
              context.fillStyle = getComputedStyle(token).color;
              context.fillRect(0, 0, 1, 1);
              const foreground = luminance(
                context.getImageData(0, 0, 1, 1).data,
              );
              if (
                (Math.max(background, foreground) + 0.05) /
                  (Math.min(background, foreground) + 0.05) <
                4.5
              )
                throw new Error(
                  `Insufficient ${token.dataset["codeToken"]} syntax contrast`,
                );
            }
            Object.defineProperty(navigator, "clipboard", {
              configurable: true,
              value: {
                writeText: async (text: string): Promise<void> => {
                  document.documentElement.dataset["copiedCode"] = text;
                },
              },
            });
            const copy = document.querySelector(
              '[data-streamdown="code-block-copy-button"]',
            );
            if (copy)
              document.documentElement.dataset["copyIcon"] = copy.innerHTML;
          });
          await clickSelector(
            page,
            '[data-streamdown="code-block-copy-button"]',
          );
          await waitForPage(
            "code copied without line numbers or token markup",
            () =>
              evaluatePageWith(
                page,
                (expected) =>
                  document.documentElement.dataset["copiedCode"] === expected,
                entity.body.split("```ts\n")[1]?.split("\n```")[0] ?? "",
              ),
          );
          await waitForPage("copy action restored", () =>
            evaluatePage(
              page,
              () =>
                document.querySelector(
                  '[data-streamdown="code-block-copy-button"]',
                )?.innerHTML === document.documentElement.dataset["copyIcon"],
            ),
          );
          for (const slot of ["code-block-body", "table-wrapper"]) {
            const overflowing = await evaluatePageWith(
              page,
              (name) => {
                const region = document.querySelector<HTMLElement>(
                  `[data-streamdown="${name}"]`,
                );
                if (
                  region?.tabIndex !== 0 ||
                  !region.getAttribute("aria-label")
                )
                  throw new Error(
                    "Markdown overflow is not keyboard accessible",
                  );
                region.focus();
                return region.scrollWidth > region.clientWidth;
              },
              slot,
            );
            if (overflowing) {
              await page.cdp("Input.dispatchKeyEvent", {
                type: "keyDown",
                key: "ArrowRight",
                code: "ArrowRight",
                windowsVirtualKeyCode: 39,
              });
              await page.cdp("Input.dispatchKeyEvent", {
                type: "keyUp",
                key: "ArrowRight",
                code: "ArrowRight",
                windowsVirtualKeyCode: 39,
              });
              await waitForPage("markdown keyboard scrolling", () =>
                evaluatePageWith(
                  page,
                  (name) =>
                    (document.querySelector(`[data-streamdown="${name}"]`)
                      ?.scrollLeft ?? 0) > 0,
                  slot,
                ),
              );
            }
          }
          await waitForVisualStability(page);
          await evaluatePage(page, () => {
            document
              .querySelectorAll<HTMLElement>(
                '[data-streamdown="code-block-body"], [data-streamdown="table-wrapper"]',
              )
              .forEach((region) => {
                region.scrollLeft = 0;
                region.blur();
              });
            const preview = document.querySelector("[data-studio-preview]");
            if (preview) preview.scrollTop = 0;
          });
          await writeFile(
            path.join(
              ARTIFACT_DIR,
              `studio-markdown-${viewport.width}x${viewport.height}-${climate}.png`,
            ),
            await page.screenshot({ encoding: "buffer", format: "png" }),
          );
          if (viewport.width <= 640) {
            await pointerDownSelector(page, ".studio-mobile-tabs button");
            await clickText(page, '[role="menuitem"]', "Properties");
          }
          await clickText(page, "summary", "Sync details");
          await evaluatePage(page, () => {
            const stations = [
              ...document.querySelectorAll<HTMLElement>(
                "[data-studio-station]",
              ),
            ];
            if (
              stations.length === 0 ||
              stations.some(
                (station) => station.getBoundingClientRect().height === 0,
              )
            )
              throw new Error(
                "Sync diagnostics must remain visible on every viewport",
              );
          });
          await clickText(page, "summary", "Sync details");
        }
        if (surface === "studio-conflict") {
          // Save with an unchanged title: the fixture answers 409, raising
          // the reconcile card above the save bar.
          await clickSelector(page, studioSaveSelector);
          await waitForSelector(page, "[data-studio-conflict]");
          await clickText(page, "button", "Compare changes");
          await waitForSelector(page, '[role="dialog"]');
          await waitForPage("latest conflict version loaded", () =>
            evaluatePage(page, () => {
              const fields = document.querySelectorAll<HTMLTextAreaElement>(
                '[role="dialog"] textarea',
              );
              return (
                fields.length === 2 &&
                fields[1]?.value.includes("Notes from the rhizome") === true
              );
            }),
          );
          await clickText(page, '[role="dialog"] button', "Use latest version");
          await waitForText(page, "Replace your local draft?");
          await clickText(page, "button", "Keep my draft");
          await clickSelector(page, '[role="dialog"] [aria-label="Close"]');
          await waitForPage("comparison closed without replacing draft", () =>
            evaluatePage(
              page,
              () =>
                !document.querySelector('[role="dialog"]') &&
                !!document.querySelector("[data-studio-conflict]"),
            ),
          );
          await evaluatePage(page, () => {
            const active = document.activeElement;
            if (
              !(active instanceof HTMLElement) ||
              active.textContent !== "Compare changes"
            )
              throw new Error("Comparison did not restore trigger focus");
            active.blur();
          });
        }
        if (surface === "studio-invalid") {
          // Two validation aspects in one frame: a server-rejected save
          // (the fixture 400s on "!!") pins the pipeline error line, then
          // an emptied required title pins the :user-invalid outline.
          await fillLabel(page, "Title", "Notes from the rhizome!!");
          if (viewport.width <= 640) {
            await pointerDownSelector(page, ".studio-mobile-tabs button");
            await clickText(page, '[role="menuitem"]', "Source");
            await waitForSelector(page, '[data-mobile-pane="write"]');
          }
          await clickSelector(page, studioSaveSelector);
          await waitForSelector(page, '[aria-invalid="true"]');
          await evaluatePage(page, () => {
            const input = document.querySelector<HTMLInputElement>(
              '[aria-invalid="true"]',
            );
            if (
              !input ||
              document.activeElement !== input ||
              !input.value.endsWith("!!")
            )
              throw new Error(
                "Server validation must focus the rejected field without changing its draft",
              );
            if (
              !document
                .getElementById(input.getAttribute("aria-describedby") ?? "")
                ?.textContent.includes("Title may not contain")
            )
              throw new Error("Field error has no accessible description");
          });
          await fillLabel(page, "Title", "");
          if (viewport.width <= 640) {
            await pointerDownSelector(page, ".studio-mobile-tabs button");
            await clickText(page, '[role="menuitem"]', "Preview");
            await waitForSelector(page, '[data-mobile-pane="preview"]');
            await clickSelector(page, studioSaveSelector);
            await waitForSelector(page, '[data-mobile-pane="details"]');
            await waitForPage(
              "native validation focuses the revealed property",
              () =>
                evaluatePage(
                  page,
                  () =>
                    document.activeElement instanceof HTMLInputElement &&
                    !document.activeElement.validity.valid,
                ),
            );
          }
          await blurLabel(page, "Title");
          await waitForPage("invalid title field", () =>
            page.evaluate<boolean>(
              'document.querySelector("[data-studio-field] input:user-invalid") !== null',
            ),
          );
        }
        if (surface === "studio-upload") {
          // Exercise explicit recovery before leaving a second upload pending.
          for (const name of ["retry-cover.png", "verdigris-board.png"]) {
            const selected = await evaluatePageWith(
              page,
              async ({ selector, url, name, mediaType }) => {
                const input = document.querySelector(selector);
                if (!(input instanceof HTMLInputElement)) return false;
                const response = await fetch(url);
                const file = new File([await response.arrayBuffer()], name, {
                  type: mediaType,
                });
                const transfer = new DataTransfer();
                transfer.items.add(file);
                input.files = transfer.files;
                input.dispatchEvent(new Event("input", { bubbles: true }));
                input.dispatchEvent(new Event("change", { bubbles: true }));
                return true;
              },
              {
                selector: '[data-studio-field="image"] input[type="file"]',
                url: "/fixture/verdigris.png",
                name,
                mediaType: "image/png",
              },
            );
            if (!selected)
              throw new Error("Could not select Studio upload input");
            if (name === "retry-cover.png") {
              await waitForText(page, "Fixture upload interrupted");
              await clickText(
                page,
                '[data-studio-field="image"] button',
                "Retry upload",
              );
              await waitForText(page, "Save changes to keep this reference");
              await waitForText(page, "image/recovered-cover");
            } else {
              await waitForText(page, "Uploading verdigris-board.png");
              await evaluatePage(page, () => {
                const status = document.querySelector(
                  '[data-studio-field="image"] [role="status"]',
                );
                status?.scrollIntoView({ block: "nearest" });
              });
            }
          }
        }
        if (
          ["studio-chat", "studio-administration", "studio-account"].includes(
            surface,
          )
        )
          await verifyDirectStudioNavigation(page, surface, viewport.width);
        if (
          [
            "studio-administration",
            "studio-administration-invitations",
            "studio-administration-audit",
          ].includes(surface)
        )
          await verifyAdministrationRecords(page, surface);
        await evaluatePage(page, () => document.fonts.ready);
        await waitForVisualStability(page);
        await checkLayout(page, surface, viewport.width, viewport.height);
        if (surface.startsWith("studio-"))
          await verifyStudioKeyboardAccess(page);
        if (surface.startsWith("studio-"))
          await auditStudioAccessibility(
            page,
            `${surface}-${viewport.width}x${viewport.height}-${climate}`,
          );
        await settleVisualCapture(page);
        await verifyDisabledPrimaries(page);
        const image = await page.screenshot({
          encoding: "buffer",
          format: "png",
        });
        if (surface === "studio-editor") {
          if (viewport.width <= 640) {
            await pointerDownSelector(page, 'button[aria-label="Editor view"]');
            await clickText(page, '[role="menuitem"]', "Properties");
          }
          await evaluatePage(page, () => {
            const properties = document.querySelector<HTMLElement>(
              "[data-studio-properties]",
            );
            if (!properties) throw Error("Missing Properties scroller");
            properties.scrollTop = properties.scrollHeight;
            window.scrollTo(0, 0);
          });
          await settleVisualCapture(page);
          await verifyNativeDateFits(page);
          await evaluatePage(page, () => {
            const date = document.querySelector<HTMLInputElement>(
              'input[type="datetime-local"]',
            );
            const note = document.querySelector<HTMLElement>(
              'label:has(input[type="file"]) small',
            );
            if (
              date?.value !== "2026-07-14T09:00" ||
              !note ||
              note.scrollWidth > note.clientWidth + 1
            )
              throw Error(
                "Properties must retain the date value and wrap the full upload guidance",
              );
          });
          const propertiesName = `studio-editor-properties-${viewport.width}x${viewport.height}-${climate}`;
          await auditStudioAccessibility(page, propertiesName);
          await recordVisualCapture(
            `${propertiesName}.png`,
            await page.screenshot({ encoding: "buffer", format: "png" }),
          );
        }
        if (
          surface === "studio-system" ||
          surface === "studio-system-anchor-profile"
        ) {
          await evaluatePage(page, () =>
            document
              .querySelector("[data-studio-editor-content] > section > header")
              ?.scrollIntoView({ block: "start" }),
          );
          await activateWorkspaceTab(page, "Source");
          await settleVisualCapture(page);
          const bodyName = `${surface}-body-${viewport.width}x${viewport.height}-${climate}`;
          await auditStudioAccessibility(page, bodyName);
          await recordVisualCapture(
            `${bodyName}.png`,
            await page.screenshot({ encoding: "buffer", format: "png" }),
          );
        }
        if (
          surface === "studio-system" &&
          viewport.width === 1440 &&
          climate === "instrument"
        ) {
          const original = systemFixtures.get("style-guide")?.entity;
          if (!original || !isRecord(original.frontmatter["voice"]))
            throw Error("Missing real Style guide fixture");
          await fillLabel(page, "Summary", "!!");
          await clickSelector(page, studioSaveSelector);
          await waitForText(page, "Review this summary.");
          if (
            !(await evaluatePage(
              page,
              () =>
                document.activeElement?.getAttribute("aria-invalid") === "true",
            ))
          )
            throw Error("Nested validation must focus its field");
          const summary = "A revised voice, kept only in this fixture.";
          await fillLabel(page, "Summary", summary);
          for (const label of ["Preview", "Source"]) {
            await evaluatePage(page, () =>
              document
                .querySelector('[aria-label="Editor body view"]')
                ?.scrollIntoView({ block: "center" }),
            );
            await activateWorkspaceTab(page, label);
          }
          await clickSelector(page, studioSaveSelector);
          const expected = {
            ...original.frontmatter,
            voice: { ...original.frontmatter["voice"], summary },
          };
          await waitForPage(
            "System save payload",
            async () =>
              JSON.stringify(lastSystemSave?.frontmatter) ===
              JSON.stringify(expected),
          );
          if (
            JSON.stringify(lastSystemSave?.frontmatter) !==
              JSON.stringify(expected) ||
            lastSystemSave?.body !== original.body
          )
            throw Error(
              "Nested edits and mode changes must preserve siblings and exact body bytes",
            );
          console.log(
            "✓ System nested validation, draft handoff and unchanged body payload",
          );
        }
        if (surface === "dashboard") {
          await navigateToNetworkIdle(
            page,
            `http://127.0.0.1:${server.port}/dashboard?climate=${climate}&fixture-state=waiting#system`,
          );
          await evaluatePage(page, async () => {
            await document.fonts.ready;
            const panel = document.getElementById("system");
            if (
              !panel ||
              panel.hidden ||
              !panel.querySelector('[data-status-summary="warn"]') ||
              !panel.querySelector('[data-readiness-tone="neutral"]') ||
              panel.querySelectorAll('tbody tr[data-tone="warn"]').length !== 2
            )
              throw new Error(
                "Production System rendering lost degraded/waiting states",
              );
            if (
              !panel.textContent.includes(
                "One or more advertised public surfaces are unavailable.",
              )
            )
              throw new Error("Missing public outage diagnostic");
            window.scrollTo(0, 0);
          });
          await writeFile(
            path.join(
              ARTIFACT_DIR,
              `dashboard-system-waiting-${viewport.width}x${viewport.height}-${climate}.png`,
            ),
            await page.screenshot({ encoding: "buffer", format: "png" }),
          );
        }
        if (surface === "dashboard") {
          for (const tab of ["knowledge", "network"] as const) {
            await clickSelector(page, `[data-dashboard-tab-link="${tab}"]`);
            await evaluatePageWith(
              page,
              (section) => {
                const panel = document.getElementById(section);
                const frame = panel?.querySelector<HTMLElement>(".map-field");
                const empty = frame?.querySelector(".map-empty");
                if (
                  !panel ||
                  panel.hidden ||
                  !frame ||
                  !empty ||
                  panel.querySelector("svg") ||
                  Math.abs(
                    empty.getBoundingClientRect().width - frame.clientWidth,
                  ) > 1 ||
                  getComputedStyle(empty).minHeight !==
                    (window.innerWidth <= 700 ? "260px" : "360px")
                )
                  throw new Error(
                    "Empty map lost its full-width reading state",
                  );
                window.scrollTo(0, 0);
              },
              tab,
            );
            await writeFile(
              path.join(
                ARTIFACT_DIR,
                `dashboard-${tab}-empty-${viewport.width}x${viewport.height}-${climate}.png`,
              ),
              await page.screenshot({ encoding: "buffer", format: "png" }),
            );
          }
          await navigateToNetworkIdle(
            page,
            `http://127.0.0.1:${server.port}/dashboard?climate=${climate}&fixture-state=declarative-network#network`,
          );
          await evaluatePage(page, async () => {
            await document.fonts.ready;
            const frame = document.querySelector<HTMLElement>(
              ".proximity-map-field",
            );
            const graphic = frame?.querySelector("svg");
            if (!frame || !graphic)
              throw new Error("Missing declarative network frame");
            if (
              graphic.getAttribute("viewBox") !== "0 0 980 560" ||
              Math.abs(
                graphic.getBoundingClientRect().width / frame.clientWidth -
                  (window.innerWidth <= 700 ? 1.55 : 1),
              ) > 0.01 ||
              getComputedStyle(graphic).minHeight !==
                (window.innerWidth <= 700 ? "260px" : "360px") ||
              !getComputedStyle(frame).backgroundImage.includes(
                "radial-gradient",
              )
            )
              throw new Error(
                "Declarative network lost its compiled projection frame",
              );
            window.scrollTo(0, 0);
          });
          await verifyMapMotion(page);
          await writeFile(
            path.join(
              ARTIFACT_DIR,
              `dashboard-network-declarative-${viewport.width}x${viewport.height}-${climate}.png`,
            ),
            await page.screenshot({ encoding: "buffer", format: "png" }),
          );
        }
        if (surface === "dashboard") {
          await navigateToNetworkIdle(
            page,
            `http://127.0.0.1:${server.port}/dashboard?climate=${climate}&fixture-state=dense-map#knowledge`,
          );
          await evaluatePage(page, async () => {
            await document.fonts.ready;
            const index =
              document.querySelector<HTMLElement>("[data-map-index]");
            const remainder = index?.querySelector(
              "[data-map-index-remainder]",
            );
            const note = index?.querySelector("[data-map-index-note]");
            const controls = index?.querySelectorAll("button");
            if (!index || !remainder || !note || controls?.length !== 8)
              throw new Error(
                "Dense atlas lost its bounded index and remainder",
              );
            if (
              !remainder.textContent.includes("12 smaller territories") ||
              index.scrollWidth > index.clientWidth + 1
            )
              throw new Error("Dense atlas lost source detail or bounds");
            if (
              window.innerWidth > 700 &&
              note.getBoundingClientRect().top <
                remainder.getBoundingClientRect().bottom - 1
            )
              throw new Error("Dense atlas guidance overlaps its remainder");
            if (
              remainder.getBoundingClientRect().top <
                Math.max(
                  ...Array.from(
                    controls,
                    (control) => control.getBoundingClientRect().bottom,
                  ),
                ) -
                  1 ||
              (window.innerWidth > 700 &&
                note.getBoundingClientRect().bottom >
                  index.getBoundingClientRect().bottom + 1)
            )
              throw new Error(
                "Dense atlas clips or overlaps its full record list",
              );
            for (const control of controls) {
              if (
                control.title !==
                  control.querySelector("strong")?.textContent ||
                (window.innerWidth <= 700 &&
                  control.getBoundingClientRect().height < 44)
              )
                throw new Error(
                  "Dense atlas lost full labels or usable controls",
                );
            }
            const labels = Array.from(
              document.querySelectorAll<SVGTextElement>(
                "[data-knowledge-label]",
              ),
            );
            if (labels.length !== 7)
              throw Error("Dense atlas lost its seven source labels");
            for (const label of labels) {
              if (
                label.querySelector("title")?.textContent !==
                  label.getAttribute("aria-label") ||
                label.getAttribute("data-label-truncated") !== "true"
              )
                throw Error(
                  "Crowded label lost its full source title or explicit truncation",
                );
              const box = label.getBBox();
              if (
                box.x < 4 ||
                box.x + box.width > 816 ||
                box.y < 0 ||
                box.y + box.height > 480
              )
                throw Error("Territory label is outside its SVG bounds");
              for (const other of labels) {
                if (other === label) continue;
                const target = other.getBBox();
                if (
                  box.x < target.x + target.width + 2 &&
                  box.x + box.width + 2 > target.x &&
                  box.y < target.y + target.height + 2 &&
                  box.y + box.height + 2 > target.y
                )
                  throw Error("Dense territory labels overlap");
              }
            }
            index.scrollIntoView({ block: "start" });
          });
          await writeFile(
            path.join(
              ARTIFACT_DIR,
              `dashboard-knowledge-index-dense-${viewport.width}x${viewport.height}-${climate}.png`,
            ),
            await page.screenshot({ encoding: "buffer", format: "png" }),
          );
        }
        const name = `${surface}-${viewport.width}x${viewport.height}-${climate}.png`;
        await recordVisualCapture(name, image);
        if (surface === "studio-chat" || surface === "studio-account")
          await verifyStudioProfileNavigation(page, surface);
        if (surface === "studio-chat") {
          const attachmentUrl = new URL(
            await page.evaluate<string>("location.href"),
          );
          attachmentUrl.pathname = "/chat";
          attachmentUrl.searchParams.set("session", "cards");
          attachmentUrl.searchParams.set("climate", climate);
          await navigateToNetworkIdle(page, attachmentUrl.href);
          await waitForSelector(page, ".studio-chat-attachment-preview");
          await evaluatePage(page, () =>
            document
              .querySelector(".studio-chat-attachment-preview")
              ?.scrollIntoView({ block: "center" }),
          );
          await waitForPage("generated image to load", () =>
            evaluatePage(page, () => {
              const preview = document.querySelector<HTMLImageElement>(
                ".studio-chat-attachment-preview",
              );
              return Boolean(preview?.complete && preview.naturalWidth > 0);
            }),
          );
          await evaluatePage(page, () => {
            const preview = document.querySelector<HTMLImageElement>(
              ".studio-chat-attachment-preview",
            );
            const card = preview?.closest(".studio-chat-card");
            if (
              !preview ||
              !card ||
              preview.getBoundingClientRect().width > card.clientWidth ||
              document.documentElement.scrollWidth > innerWidth
            )
              throw new Error("Generated image escaped its card or viewport");
          });
          await clickSelector(page, ".studio-chat-image-trigger");
          await waitForPage("full image to load", () =>
            evaluatePage(page, () => {
              const image = document.querySelector<HTMLImageElement>(
                '[role="dialog"] .studio-chat-full-image',
              );
              return Boolean(image?.complete && image.naturalWidth > 0);
            }),
          );
          await auditStudioAccessibility(page, "studio-chat-image-preview");
          await page.cdp("Input.dispatchKeyEvent", {
            type: "keyDown",
            key: "Escape",
            code: "Escape",
            windowsVirtualKeyCode: 27,
          });
          await page.cdp("Input.dispatchKeyEvent", {
            type: "keyUp",
            key: "Escape",
            code: "Escape",
            windowsVirtualKeyCode: 27,
          });
          await waitForPage("image preview focus restoration", () =>
            evaluatePage(
              page,
              () =>
                !document.querySelector('[role="dialog"]') &&
                document.activeElement?.matches(
                  ".studio-chat-image-trigger",
                ) === true,
            ),
          );
          const attachmentName = `studio-chat-attachments-${viewport.width}x${viewport.height}-${climate}`;
          await auditStudioAccessibility(page, attachmentName);
          await recordVisualCapture(
            `${attachmentName}.png`,
            await page.screenshot({ encoding: "buffer", format: "png" }),
          );
        }
        page.close();
      }
    }
  }
} finally {
  Bun.WebView.closeAll();
  for (const release of pendingUploadResponses) release();
  await server.stop(true);
  await administrationFixture.dispose();
}

if (failures.length > 0) {
  throw new Error(
    `Console visual regression failed:\n${failures.join("\n")}\nReview artifacts in ${ARTIFACT_DIR}.`,
  );
}
console.log(
  UPDATE
    ? `Updated console baselines in ${BASELINE_DIR}`
    : "Console visual regression passed.",
);
