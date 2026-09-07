import { mkdir, readFile, writeFile } from "node:fs/promises";
import { getErrorMessage } from "@brains/utils/error";
import path from "node:path";
import { PNG } from "pngjs";
import { createAdministrationFixture } from "./fixtures/studio-administration";
import { createWorkViewFixtures } from "./fixtures/studio-work-views";
import { createElement, type ReactElement } from "react";
import { renderChatPage } from "@brains/web-chat";
import { renderEditorShellHtml } from "@brains/studio";
import {
  renderDashboardPageHtml,
  type DashboardRenderInput,
} from "@brains/dashboard";
import { createMockAppInfo } from "@brains/test-utils";
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
const SURFACE_FILTER = process.argv
  .find((argument) => argument.startsWith("--surface="))
  ?.slice("--surface=".length);
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
    count: 4,
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
const contentSyncWorkspaceData = {
  view: {
    title: "Content sync",
    primaryAction: { actionId: "sync-now", label: "Sync now", input: {} },
    blocks: [
      {
        type: "notice",
        id: "sync-issues-git",
        title: "Repository sync needs attention",
        text: "1 recorded issue · brain-data",
        tone: "warn",
        details: [
          "Occurred: 2026-09-05T09:15:00.000Z\nPath: brain-data\nThe remote rejected the push because it contains newer commits. The local export is retained. Review the repository before retrying the sync.",
        ],
      },
      {
        type: "columns",
        id: "sync-body",
        primary: [
          {
            type: "card",
            id: "recent-runs-section",
            label: "Recent runs",
            metadata: ["2 retained"],
            blocks: [
              {
                type: "list",
                id: "recent-runs",
                presentation: "editorial",
                empty: "No directory sync runs have completed yet.",
                items: [
                  {
                    id: "run-1",
                    title: "Manual sync · failed",
                    description: "The remote rejected the push.",
                    tone: "error",
                    metadata: [
                      "Imported: 12",
                      "Exported: 4",
                      "Completed: 2026-09-05T09:15:00.000Z",
                    ],
                  },
                  {
                    id: "run-2",
                    title: "Watch sync · succeeded",
                    description: "The content directory is up to date.",
                    metadata: [
                      "Imported: 2",
                      "Exported: 0",
                      "Completed: 2026-09-05T09:14:00.000Z",
                    ],
                  },
                ],
              },
            ],
          },
          {
            type: "card",
            id: "changed-files-section",
            label: "Changed files",
            metadata: ["1 in working tree"],
            blocks: [
              {
                type: "list",
                id: "changed-files",
                presentation: "editorial",
                empty: "No changed files.",
                items: [
                  {
                    id: "changed-1",
                    title: "notes/shared-tools.md",
                    badges: [{ label: "modified" }],
                  },
                ],
              },
            ],
          },
        ],
        aside: [
          {
            type: "card",
            id: "sync-source-card",
            label: "Connection",
            blocks: [
              {
                type: "key-values",
                id: "sync-source",
                items: [
                  { label: "Folder", value: "brain-data" },
                  { label: "Available", value: true },
                  { label: "Watcher", value: "Watching" },
                  { label: "Last settled", value: "2026-09-05T09:15:00.000Z" },
                ],
              },
            ],
          },
          {
            type: "card",
            id: "sync-repository-card",
            label: "Repository details",
            presentation: "disclosure",
            blocks: [
              {
                type: "key-values",
                id: "sync-git-source",
                items: [
                  { label: "Branch", value: "main" },
                  { label: "Remote", value: "origin" },
                ],
              },
              {
                type: "stats",
                id: "sync-summary",
                items: [
                  { label: "Files", value: 84 },
                  { label: "Entity types", value: 12 },
                  { label: "Issues", value: 1, tone: "warn" },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
};

const siteWorkspaceData = {
  view: {
    title: "Site",
    blocks: [
      {
        type: "tabs",
        id: "site-environments",
        label: "Environment",
        defaultTab: "preview",
        tabs: (["preview", "production"] as const).map((environment) => ({
          id: environment,
          label: environment === "preview" ? "Preview" : "Production",
          blocks: [
            {
              type: "columns",
              id: `site-${environment}`,
              primary: [
                {
                  type: "card",
                  id: `${environment}-card`,
                  label: "Published",
                  presentation: "feature",
                  metadata: [
                    environment === "preview" ? "Preview" : "Production",
                  ],
                  blocks: [
                    {
                      type: "key-values",
                      items: [
                        {
                          label: "Published generation",
                          value: `build-20260711163352-${environment}`,
                        },
                        {
                          label: "Published at",
                          value: "2026-07-11T16:33:52.000Z",
                        },
                        { label: "Published result", value: "31 routes" },
                        {
                          label: "Last successful render",
                          value: "2026-07-11T16:33:52.000Z",
                        },
                        {
                          label: "Rendered result",
                          value: `31 routes · build-20260711163352-${environment}`,
                        },
                      ],
                    },
                    {
                      type: "actions",
                      items: [
                        {
                          actionId: `build-${environment}`,
                          label: `Build ${environment}`,
                          input: {},
                          ...(environment === "production"
                            ? {
                                confirmation: {
                                  kind: "static",
                                  message:
                                    "Build and publish the production site now?",
                                },
                              }
                            : {}),
                        },
                      ],
                    },
                  ],
                },
                {
                  type: "card",
                  id: "site-recent-builds",
                  label: "Recent builds",
                  blocks: [
                    {
                      type: "list",
                      id: "recent-builds",
                      presentation: "activity",
                      empty: "No site builds have completed yet.",
                      items: [
                        {
                          id: `build-${environment}`,
                          title: `${environment} · succeeded`,
                          metadata: [
                            "Completed: 2026-07-11T16:33:52.000Z",
                            "Routes: 31",
                          ],
                        },
                      ],
                    },
                  ],
                },
              ],
              aside: [
                {
                  type: "card",
                  id: "site-routes",
                  label: "Configured routes",
                  metadata: ["31 configured"],
                  blocks: [
                    {
                      type: "table",
                      id: "routes",
                      empty: "No site routes are configured.",
                      columns: [
                        { key: "title", label: "Route" },
                        { key: "path", label: "Path" },
                      ],
                      rows: [
                        { title: "Home", path: "/" },
                        { title: "Notes", path: "/notes/" },
                        { title: "About", path: "/about/" },
                        { title: "Newsletter", path: "/newsletter/" },
                        { title: "Essays", path: "/essays/" },
                        { title: "Topics", path: "/topics/" },
                        { title: "Now", path: "/now/" },
                        { title: "Archive", path: "/archive/" },
                      ].map((route, index) => ({
                        id: `route-${index}`,
                        cells: route,
                        compact: { title: route.title, metadata: [route.path] },
                      })),
                    },
                    {
                      type: "notice",
                      id: "routes-remainder",
                      text: "23 further routes are configured.",
                    },
                  ],
                },
                {
                  type: "card",
                  id: "site-automation-card",
                  label: "Automation",
                  blocks: [
                    {
                      type: "key-values",
                      id: "automation",
                      items: [
                        { label: "Automatic rebuild", value: true },
                        { label: "Debounce", value: "2000 ms" },
                        { label: "Default environment", value: "preview" },
                      ],
                    },
                  ],
                },
                {
                  type: "card",
                  id: "site-automation-links",
                  label: "Site links",
                  blocks: [
                    {
                      type: "links",
                      id: "site-links",
                      items: [
                        {
                          label: "Open preview",
                          target: {
                            kind: "external",
                            href: "https://preview.example.com",
                          },
                        },
                        {
                          label: "Open live site",
                          target: {
                            kind: "external",
                            href: "https://example.com",
                          },
                        },
                        {
                          label: "Edit site settings",
                          target: {
                            kind: "entity",
                            entityType: "site-info",
                            id: "site-info",
                          },
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        })),
      },
    ],
  },
};

const publishingWorkspaceData = {
  view: {
    title: "Publishing",
    blocks: [
      {
        type: "card",
        id: "publishing-attention",
        label: "One delivery needs attention",
        blocks: [
          {
            type: "list",
            id: "publication-failures",
            items: [
              {
                id: "post:field-notes",
                title: "Notes from the rhizome",
                description: "Provider rejected the last delivery attempt.",
                metadata: ["Newsletter", "2 retries left"],
                actions: [
                  {
                    actionId: "retry",
                    label: "Retry",
                    input: { entityType: "posts", entityId: "field-notes" },
                  },
                ],
              },
            ],
          },
        ],
      },
      {
        type: "tabs",
        id: "publishing-queue",
        label: "Publishing queue",
        defaultTab: "queued",
        tabs: [
          {
            id: "queued",
            label: "Queued",
            count: 1,
            blocks: [
              {
                type: "list",
                id: "dispatch-queue",
                empty: "The publishing queue is empty.",
                items: [
                  {
                    id: "post:quiet-infrastructure",
                    title: "Quiet infrastructure",
                    description: "Queued for the newsletter provider.",
                    metadata: ["Post", "Newsletter", "position 1"],
                    badges: [{ label: "queued" }],
                    actions: [
                      {
                        actionId: "remove",
                        label: "Remove",
                        input: { id: "quiet-infrastructure" },
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
      {
        type: "key-values",
        id: "publishing-summary",
        items: [{ label: "Published", value: 18 }],
      },
    ],
  },
};

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
  body: "# Notes from the rhizome\n\nA good console should make dense systems feel calm. Its structure needs to remain legible while the viewport changes around it.\n\n> The interface is not a dashboard pasted onto every screen. It is a continuous instrument with distinct working climates.\n\n## Responsive field rules\n\n- Keep shared wayfinding stable.\n- Let local tools adapt to the task.\n- Preserve touch targets and safe areas.\n\nThe result should feel authored at every width.",
  contentHash: "fixture-hash",
  created: "2026-06-18T09:00:00.000Z",
};
const styleGuideEntity = {
  ...entity,
  id: "style-guide",
  entityType: "style-guide",
  frontmatter: {
    title: "Rover Collective voice",
    tone: "Warm, precise and candid. Prefer useful language over performance.",
    accent: "verdigris + vermilion",
  },
  body: "# A working voice\n\nWrite as a capable collaborator: direct enough to act on, generous enough to understand.\n\n> The interface should feel authored, but it should never compete with the work.\n\nUse structure to make complex systems legible. Names should describe stable concepts rather than implementation details.",
};
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
  await waitForPage("Library group expands", () =>
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
        .querySelector(".studio-body > :not(aside), .studio-chat-workspace")
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
      const label = Array.from(document.querySelectorAll("label")).find(
        (candidate) => candidate.textContent.includes(text),
      );
      const input = label?.htmlFor
        ? document.getElementById(label.htmlFor)
        : label?.querySelector("input, textarea");
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
      localStorage.setItem(
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
    surface === "studio-system" ||
    surface === "studio-delete" ||
    surface === "studio-conflict" ||
    surface === "studio-invalid" ||
    surface === "studio-upload"
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
      ".studio > .studio-body > .rail",
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
          ".studio-body",
          ".studio-workspace-frame",
          ".listing",
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
        ".declarative-detail-master .operator-record-list",
      );
      if (!records || records.width > width)
        throw new Error(
          "Administration must use bounded record lists, not reflowed tables",
        );
    }
  }
  if (surface.startsWith("studio-chat")) {
    const destinations = await elementDisplay(
      page,
      ".studio-chat-mobile-sessions",
    );
    const sessions = await elementDisplay(page, ".studio-chat-sessions");
    if (destinations === "none" || width <= 860 !== (sessions === "none")) {
      throw new Error(`Studio Chat responsive mode mismatch at ${width}px`);
    }
    const workspace = await elementBounds(page, ".studio-chat-room");
    const composer = await elementBounds(page, ".studio-chat-composer");
    if (!workspace || !composer) {
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
    const modes = await elementDisplay(page, ".studio-mobile-tabs");
    if (width <= 640 !== (modes !== "none"))
      throw new Error(`Studio responsive mode mismatch at ${width}px`);
    if (width <= 900) {
      const pipeline = await elementBounds(page, ".pipeline");
      if (!pipeline || pipeline.y + pipeline.height > viewportHeight + 1)
        throw new Error(`Studio save bar escaped the viewport at ${width}px`);
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
const administrationFixture = await createAdministrationFixture(FIXED_NOW);
const workViewFixtures = await createWorkViewFixtures();
const server = Bun.serve({
  port: 0,
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === "/fixture/verdigris.png")
      return new Response(fixtureImage, {
        headers: { "content-type": "image/png" },
      });
    if (url.pathname === "/dashboard")
      return new Response(
        climateHtml(renderDashboardPageHtml(dashboardInput()), request),
        { headers: { "content-type": "text/html" } },
      );
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
    if (url.pathname === "/api/chat/sessions") return json({ sessions });
    if (url.pathname === "/api/chat/uploads")
      return new Response("# Verdigris field notes\n", {
        headers: { "content-type": "text/markdown" },
      });
    if (url.pathname === "/api/chat/messages") {
      const id = url.searchParams.get("id");
      return json({
        messages:
          id === "cards" ? cardMessages : id === "empty" ? [] : messages,
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
        types,
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
          data: contentSyncWorkspaceData,
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
          data: siteWorkspaceData,
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
          data: publishingWorkspaceData,
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
          displayName: "Mira Reyes",
          role: "admin",
          connectedChannels: [
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
          ],
        },
      });
    if (
      url.pathname === "/studio/api/schema" &&
      url.searchParams.get("type") === "style-guide"
    )
      return json({
        entityType: "style-guide",
        format: "frontmatter",
        isSingleton: true,
        hasBody: true,
        fields: [
          { name: "title", label: "Title", widget: "string", required: true },
          { name: "tone", label: "Tone", widget: "text", required: false },
          {
            name: "accent",
            label: "Accent",
            widget: "string",
            required: false,
          },
        ],
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
        frontmatter?: { title?: string };
      };
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
    if (
      url.pathname === "/studio/api/entities" &&
      url.searchParams.get("type") === "style-guide"
    )
      return json(
        url.searchParams.has("id")
          ? { entity: styleGuideEntity }
          : { entities: [styleGuideEntity] },
      );
    if (url.pathname === "/studio/api/entities" && url.searchParams.has("id"))
      return json({ entity });
    if (url.pathname === "/studio/api/entities") return json({ entities });
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
        "studio-delete",
        "studio-conflict",
        "studio-invalid",
        "studio-upload",
      ] as const) {
        if (SURFACE_FILTER && surface !== SURFACE_FILTER) continue;
        // Session and context destinations only exist at phone widths.
        if (surface === "chat-drawer" && viewport.width > 760) continue;
        if (
          (surface === "studio-chat-sessions" ||
            surface === "studio-chat-context") &&
          viewport.width > 640
        ) {
          continue;
        }
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
          surface === "studio-system" ||
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
                            : surface === "studio-system"
                              ? "/studio/entities/style-guide/style-guide"
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
            : surface.startsWith("studio-chat")
              ? `&session=responsive`
              : "";
        await navigateToNetworkIdle(
          page,
          `http://127.0.0.1:${server.port}${route}?climate=${climate}${workspaceQuery}${hash}`,
        );
        if (
          surface === "studio-system" &&
          viewport.width <= 640 &&
          climate === "instrument"
        ) {
          for (const [label, pane] of [
            ["Source", "write"],
            ["Preview", "preview"],
            ["Properties", "details"],
          ] as const) {
            await pointerDownSelector(page, ".studio-mobile-tabs button");
            await waitForSelector(page, '[role="menuitem"]');
            await clickText(page, '[role="menuitem"]', label);
            await waitForSelector(page, `.editor[data-mobile-pane="${pane}"]`);
          }
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
          if (surface === "studio-chat" && viewport.width <= 700) {
            await clickSelector(page, ".studio-chat-mobile-sessions button");
            await waitForSelector(
              page,
              '[role="dialog"] .studio-chat-session-picker',
            );
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
                    ".studio-chat-mobile-sessions button",
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
              ".studio-chat-mobile-sessions button",
              "Sessions",
            );
          }
          if (surface === "studio-chat-context") {
            await clickSelector(page, ".studio-chat-working-set summary");
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
        if (surface === "studio-overview") {
          await waitForText(page, "Recent activity");
        }
        if (surface === "studio-content-sync") {
          await waitForText(page, "Recent runs");
          await waitForText(page, "Connection");
          await waitForText(page, "Repository sync needs attention");
        }
        if (surface === "studio-site") {
          await waitForText(page, "Build preview");
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
            await pointerDownSelector(page, ".studio-mobile-more button");
            await clickSelector(page, '[role="menuitem"]');
          } else {
            await clickSelector(
              page,
              '.pipeline [data-slot="button"][data-variant="danger"]',
            );
          }
          await waitForSelector(page, ".delete-modal");
        }
        if (surface === "studio-conflict") {
          // Save with an unchanged title: the fixture answers 409, raising
          // the reconcile card above the save bar.
          await clickSelector(page, studioSaveSelector);
          await waitForSelector(page, ".conflict");
        }
        if (surface === "studio-invalid") {
          // Two validation aspects in one frame: a server-rejected save
          // (the fixture 400s on "!!") pins the pipeline error line, then
          // an emptied required title pins the :user-invalid outline.
          await fillLabel(page, "Title", "Notes from the rhizome!!");
          await clickSelector(page, studioSaveSelector);
          await waitForSelector(page, ".status-error");
          await fillLabel(page, "Title", "");
          await blurLabel(page, "Title");
          await waitForPage("invalid title field", () =>
            page.evaluate<boolean>(
              'document.querySelector(".field input:user-invalid") !== null',
            ),
          );
        }
        if (surface === "studio-upload") {
          // Start a cover-image upload the fixture never completes, so the
          // widget's in-flight state stays up for the capture.
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
              selector: '.upload-zone input[type="file"]',
              url: "/fixture/verdigris.png",
              name: "verdigris-board.png",
              mediaType: "image/png",
            },
          );
          if (!selected)
            throw new Error("Could not select Studio upload input");
          await waitForText(page, "Uploading…");
          await evaluatePage(page, () => {
            const text = Array.from(
              document.querySelectorAll<HTMLElement>("*"),
            ).find((element) => element.textContent.trim() === "Uploading…");
            text?.scrollIntoView({ block: "nearest" });
          });
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
        await evaluatePage(page, () => {
          const style = document.createElement("style");
          style.textContent =
            "*,*::before,*::after{animation-duration:0s!important;animation-delay:0s!important;transition-duration:0s!important;caret-color:transparent!important}";
          document.head.append(style);
          return new Promise<void>((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
          );
        });
        const image = await page.screenshot({
          encoding: "buffer",
          format: "png",
        });
        const name = `${surface}-${viewport.width}x${viewport.height}-${climate}.png`;
        const baselinePath = path.join(BASELINE_DIR, name);
        if (UPDATE) {
          // Only rewrite baselines that actually changed — wholesale
          // rewrites churn every pinned file with re-encode noise.
          const ratio = await comparePng(image, baselinePath).catch(() => 1);
          if (ratio > 0.002) await writeFile(baselinePath, image);
        } else {
          try {
            const ratio = await comparePng(image, baselinePath);
            if (ratio > 0.002) {
              await writeFile(path.join(ARTIFACT_DIR, name), image);
              failures.push(
                `${name}: ${(ratio * 100).toFixed(2)}% pixels changed`,
              );
            }
          } catch (error) {
            await writeFile(path.join(ARTIFACT_DIR, name), image);
            failures.push(`${name}: ${getErrorMessage(error)}`);
          }
        }
        if (surface === "studio-chat" || surface === "studio-account")
          await verifyStudioProfileNavigation(page, surface);
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
