import { mkdir, readFile, writeFile } from "node:fs/promises";
import { getErrorMessage } from "@brains/utils/error";
import path from "node:path";
import { PNG } from "pngjs";
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
const FIXED_NOW = Date.parse("2026-07-11T16:40:00.000Z");
const VIEWPORTS = [
  { width: 1440, height: 1000 },
  { width: 768, height: 1024 },
  { width: 390, height: 844 },
] as const;
const CLIMATES = ["instrument", "paper"] as const;
const SURFACES = [
  { id: "dashboard", label: "Dashboard", href: "/dashboard", isActive: false },
  { id: "web-chat", label: "Chat", href: "/chat", isActive: false },
  { id: "studio", label: "Studio", href: "/studio", isActive: false },
];

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
const overviewWorkspaceData = {
  refreshAfterMs: 15_000,
  view: {
    kicker: "Operator home",
    title: "Overview",
    description:
      "What needs you, and what the brain did on its own. Glance here, act in the workspace that owns it.",
    status: {
      label: "3 need you",
      detail: "live operational snapshot",
      tone: "warn",
    },
    blocks: [
      {
        type: "columns",
        id: "overview-columns",
        primary: [
          {
            type: "card",
            id: "overview-attention",
            label: "Needs attention",
            tone: "warn",
            blocks: [
              {
                type: "list",
                id: "overview-attention-list",
                empty: "Nothing needs your attention.",
                items: [
                  {
                    id: "dispatch-failed",
                    title: "Newsletter dispatch failed",
                    description:
                      "Urban sensor platforms — transport rejected the payload.",
                    metadata: ["Publishing", "2 retries left", "18:20"],
                    tone: "error",
                    link: {
                      kind: "launch",
                      launch: { target: "publishing" },
                    },
                  },
                  {
                    id: "site-preview-failed",
                    title: "Site preview needs review",
                    description:
                      "One route failed during the latest preview build.",
                    metadata: ["Site", "preview environment"],
                    tone: "warn",
                    link: {
                      kind: "launch",
                      launch: { target: "site" },
                    },
                  },
                  {
                    id: "invitation-expiring",
                    title: "Grace Hopper's setup link expires soon",
                    description:
                      "The single-use invitation link expires tomorrow.",
                    metadata: ["Access", "Invitations"],
                    tone: "warn",
                    link: {
                      kind: "launch",
                      launch: { target: "invitations" },
                    },
                  },
                ],
              },
            ],
          },
          {
            type: "card",
            id: "overview-activity",
            label: "While you were away",
            blocks: [
              {
                type: "list",
                id: "overview-activity-list",
                empty: "No recent autonomous activity.",
                items: [
                  {
                    id: "mail-triage",
                    title: "9 mail items triaged",
                    description: "2 flagged high priority, 1 needs a reply.",
                    metadata: ["Inbox", "overnight"],
                    tone: "good",
                    link: {
                      kind: "launch",
                      launch: { target: "inbox" },
                    },
                  },
                  {
                    id: "preview-built",
                    title: "Site preview built",
                    description: "31 routes completed without warnings.",
                    metadata: ["Site", "16:04"],
                    tone: "good",
                  },
                  {
                    id: "notes-captured",
                    title: "3 notes captured",
                    description:
                      "From inbox follow-ups on the workshop thread.",
                    metadata: ["Notes", "14:31"],
                    tone: "neutral",
                  },
                ],
              },
            ],
          },
        ],
        aside: [
          {
            type: "card",
            id: "overview-system",
            label: "System",
            tone: "neutral",
            blocks: [
              {
                type: "key-values",
                items: [
                  { label: "Runtime", value: "operational" },
                  { label: "Jobs", value: "idle" },
                  { label: "Queue", value: "0 waiting" },
                  { label: "Version", value: "0.2.0-alpha.306" },
                ],
              },
            ],
          },
          {
            type: "card",
            id: "overview-network",
            label: "Network",
            tone: "neutral",
            blocks: [
              {
                type: "key-values",
                items: [
                  { label: "Interactions", value: 4 },
                  { label: "Channels", value: 3 },
                  { label: "Inbox sources", value: 2 },
                  { label: "Operational sources", value: 3 },
                ],
              },
            ],
          },
          {
            type: "card",
            id: "overview-sources",
            label: "All sources connected",
            tone: "good",
            blocks: [
              {
                type: "notice",
                tone: "good",
                text: "Email, directory sync, and the site pipeline are reporting normally.",
              },
            ],
          },
        ],
      },
    ],
  },
};

const administrationWorkspaceData = {
  view: {
    kicker: "Access administration",
    title: "Administration",
    description:
      "Manage local people, invitation delivery, external provenance, and security history.",
    blocks: [
      {
        type: "stats",
        id: "people-summary",
        items: [
          { label: "Active members", value: 2 },
          { label: "Active Admins", value: 1 },
          { label: "Suspended", value: 1, tone: "warn" },
        ],
      },
      {
        type: "tabs",
        id: "administration-tabs",
        label: "Administration sections",
        defaultTab: "people",
        queryKey: "tab",
        tabs: [
          {
            id: "people",
            label: "People",
            blocks: [
              {
                type: "detail",
                id: "people",
                queryKey: "selected",
                empty: "Select a person to inspect their access.",
                master: {
                  type: "table",
                  id: "people-roster",
                  empty: "No people are available.",
                  columns: [
                    { key: "person", label: "Person" },
                    { key: "role", label: "Role" },
                    { key: "status", label: "Status" },
                    { key: "brain", label: "Arrived via" },
                  ],
                  rows: [
                    {
                      id: "mira",
                      cells: {
                        person: "Mira Reyes",
                        role: "Admin",
                        status: "Active",
                        brain: "This brain",
                      },
                      compact: {
                        title: "Mira Reyes",
                        metadata: [
                          "Admin",
                          "This brain",
                          "2 passkeys · 1 channel",
                        ],
                        badges: [{ label: "Active", tone: "good" }],
                      },
                      link: { kind: "detail", itemId: "mira" },
                    },
                    {
                      id: "grace",
                      cells: {
                        person: "Grace Hopper",
                        role: "Trusted",
                        status: "Active",
                        brain: "grace.example",
                      },
                      compact: {
                        title: "Grace Hopper",
                        metadata: [
                          "Trusted",
                          "grace.example",
                          "1 passkey · 2 channels",
                        ],
                        badges: [{ label: "Active", tone: "good" }],
                      },
                      link: { kind: "detail", itemId: "grace" },
                    },
                    {
                      id: "sam",
                      cells: {
                        person: "Sam Lee",
                        role: "Public",
                        status: "Suspended",
                        brain: "This brain",
                      },
                      compact: {
                        title: "Sam Lee",
                        metadata: [
                          "Public",
                          "This brain",
                          "0 passkeys · 1 channel",
                        ],
                        badges: [{ label: "Suspended", tone: "warn" }],
                        tone: "warn",
                      },
                      link: { kind: "detail", itemId: "sam" },
                    },
                  ],
                  open: undefined,
                },
              },
              {
                type: "columns",
                id: "people-standing",
                primary: [
                  {
                    type: "card",
                    id: "people-peers",
                    label: "External brains",
                    blocks: [
                      {
                        type: "table",
                        id: "peers",
                        empty: "No external brains are linked.",
                        columns: [
                          { key: "peer", label: "Brain" },
                          { key: "person", label: "Person" },
                          { key: "verification", label: "Verification" },
                          { key: "linked", label: "Linked" },
                        ],
                        rows: [
                          {
                            id: "grace.example",
                            cells: {
                              peer: "grace.example",
                              person: "Grace Hopper",
                              verification: "Verified",
                              linked: "Aug 12, 2026",
                            },
                            compact: {
                              title: "grace.example",
                              metadata: [
                                "Grace Hopper",
                                "Trusted",
                                "Aug 12, 2026",
                              ],
                              badges: [{ label: "Verified", tone: "good" }],
                            },
                          },
                        ],
                      },
                    ],
                  },
                ],
                aside: [
                  {
                    type: "card",
                    id: "brain-anchor",
                    label: "Brain Anchor",
                    blocks: [
                      {
                        type: "key-values",
                        items: [
                          { label: "Name", value: "Mira Reyes" },
                          { label: "Kind", value: "Person" },
                          { label: "Ownership", value: "Personal" },
                        ],
                      },
                    ],
                  },
                  {
                    type: "notice",
                    id: "people-peer-note",
                    tone: "neutral",
                    title: "External brain relationships",
                    text: "A peer link records how a locally administered person relates to another brain. It does not grant or change local access.",
                  },
                  {
                    type: "card",
                    id: "link-peer",
                    label: "Link an existing person",
                    blocks: [
                      {
                        type: "text",
                        text: "Associate an external peer identity with a locally administered person.",
                      },
                    ],
                  },
                ],
              },
            ],
          },
          {
            id: "invitations",
            label: "Invitations",
            count: 1,
            blocks: [
              {
                type: "text",
                text: "Invitations load when this tab is opened.",
              },
            ],
          },
          {
            id: "audit",
            label: "Audit",
            blocks: [
              { type: "text", text: "Audit loads when this tab is opened." },
            ],
          },
        ],
      },
    ],
  },
};

const administrationInvitationsWorkspaceData = {
  view: {
    kicker: "Access administration",
    title: "Administration",
    description:
      "Manage local people, invitation delivery, external provenance, and security history.",
    primaryAction: {
      actionId: "create-invitation",
      label: "Add a person",
      input: { idempotencyKey: "visual-request" },
      form: {
        presentation: "disclosure",
        submitLabel: "Create invitation",
        fields: [
          {
            name: "displayName",
            label: "Display name",
            control: "text",
            required: true,
          },
          {
            name: "deliveryType",
            label: "Delivery channel",
            control: "select",
            required: true,
            options: [{ value: "email", label: "Private email" }],
          },
          {
            name: "deliverySubject",
            label: "Email address",
            control: "text",
            required: true,
          },
        ],
      },
      result: {
        title: "Invitation setup",
        fields: [
          { name: "status", label: "Status" },
          {
            name: "setupUrl",
            label: "Single-use setup URL",
            copyable: true,
            sensitive: true,
          },
          { name: "expiresAt", label: "Expires" },
        ],
      },
    },
    blocks: [
      {
        type: "stats",
        id: "invitation-totals",
        items: [
          { label: "Pending", value: 1 },
          { label: "History", value: 4 },
          { label: "Delivery failures", value: 0, tone: "neutral" },
        ],
      },
      {
        type: "tabs",
        id: "administration-tabs",
        label: "Administration sections",
        defaultTab: "invitations",
        queryKey: "tab",
        tabs: [
          {
            id: "people",
            label: "People",
            blocks: [{ type: "text", text: "People load on selection." }],
          },
          {
            id: "invitations",
            label: "Invitations",
            count: 1,
            blocks: [
              {
                type: "columns",
                id: "invitation-layout",
                primary: [
                  {
                    type: "table",
                    id: "invitations",
                    empty: "No pending invitations.",
                    query: {
                      controls: [
                        {
                          key: "state",
                          label: "View",
                          value: "pending",
                          options: [
                            { value: "pending", label: "Pending", count: 1 },
                            { value: "history", label: "History", count: 4 },
                          ],
                        },
                      ],
                      pagination: { offset: 0, limit: 25, total: 1 },
                    },
                    columns: [
                      { key: "person", label: "Person" },
                      { key: "role", label: "Role" },
                      { key: "state", label: "State" },
                      { key: "destination", label: "Destination" },
                      { key: "updated", label: "Updated" },
                    ],
                    rows: [
                      {
                        id: "jordan",
                        cells: {
                          person: "Jordan Rivera",
                          role: "Trusted",
                          state: "Pending",
                          destination: "jordan@example.com",
                          updated: "Aug 26, 2026",
                        },
                        compact: {
                          title: "Jordan Rivera",
                          metadata: [
                            "Trusted",
                            "jordan@example.com",
                            "Aug 26, 2026",
                          ],
                          badges: [{ label: "Pending", tone: "neutral" }],
                        },
                        actions: [
                          {
                            actionId: "resend-invitation",
                            label: "Resend",
                            input: { invitationId: "jordan" },
                          },
                          {
                            actionId: "cancel-invitation",
                            label: "Cancel",
                            input: { invitationId: "jordan" },
                            confirmation: { kind: "prepared" },
                          },
                        ],
                      },
                    ],
                  },
                ],
                aside: [
                  {
                    type: "card",
                    id: "invite-peer",
                    label: "Peer-first invitation",
                    blocks: [
                      {
                        type: "text",
                        text: "Create local access for a person known first through another brain.",
                      },
                      {
                        type: "action",
                        actionId: "invite-external-peer-person",
                        label: "Invite peer person",
                        input: {},
                        form: {
                          presentation: "disclosure",
                          submitLabel: "Invite peer person",
                          fields: [
                            {
                              name: "peerId",
                              label: "External peer ID",
                              control: "text",
                              required: true,
                            },
                            {
                              name: "displayName",
                              label: "Display name",
                              control: "text",
                              required: true,
                            },
                          ],
                        },
                      },
                    ],
                  },
                ],
              },
            ],
          },
          {
            id: "audit",
            label: "Audit",
            blocks: [{ type: "text", text: "Audit loads on selection." }],
          },
        ],
      },
    ],
  },
};

const administrationAuditWorkspaceData = {
  view: {
    kicker: "Security history",
    title: "Administration",
    description:
      "Manage local people, invitation delivery, external provenance, and security history.",
    blocks: [
      {
        type: "stats",
        id: "audit-totals",
        items: [
          { label: "Matching", value: 212 },
          { label: "Actors", value: 4 },
        ],
      },
      {
        type: "tabs",
        id: "administration-tabs",
        label: "Administration sections",
        defaultTab: "audit",
        queryKey: "tab",
        tabs: [
          {
            id: "people",
            label: "People",
            blocks: [{ type: "text", text: "People load on selection." }],
          },
          {
            id: "invitations",
            label: "Invitations",
            count: 1,
            blocks: [{ type: "text", text: "Invitations load on selection." }],
          },
          {
            id: "audit",
            label: "Audit",
            blocks: [
              {
                type: "detail",
                id: "audit-detail",
                queryKey: "selected",
                empty: "Select an event to inspect its audit record.",
                master: {
                  type: "table",
                  id: "audit-events",
                  empty: "No audit events match these filters.",
                  query: {
                    controls: [
                      {
                        key: "actorUserId",
                        label: "Actor",
                        allLabel: "All actors",
                        options: [
                          { value: "mira", label: "Mira Reyes" },
                          { value: "system", label: "System" },
                        ],
                      },
                      {
                        key: "action",
                        label: "Action",
                        allLabel: "All actions",
                        options: [
                          { value: "role", label: "Changed an account role" },
                          { value: "setup", label: "Created a setup link" },
                        ],
                      },
                    ],
                    pagination: {
                      offset: 0,
                      limit: 25,
                      total: 212,
                    },
                  },
                  columns: [
                    { key: "when", label: "When" },
                    { key: "actor", label: "Actor" },
                    { key: "action", label: "Action" },
                    { key: "target", label: "Target" },
                  ],
                  rows: [
                    {
                      id: "audit-1",
                      cells: {
                        when: "Aug 30, 2026",
                        actor: "Mira Reyes",
                        action: "Changed an account role",
                        target: "Grace Hopper",
                      },
                      compact: {
                        title: "Changed an account role",
                        metadata: ["Mira Reyes", "Grace Hopper"],
                        badges: [{ label: "Aug 30, 2026" }],
                      },
                      link: { kind: "detail", itemId: "audit-1" },
                    },
                    {
                      id: "audit-2",
                      cells: {
                        when: "Aug 29, 2026",
                        actor: "System",
                        action: "Created a setup link",
                        target: "Jordan Rivera",
                      },
                      compact: {
                        title: "Created a setup link",
                        metadata: ["System", "Jordan Rivera"],
                        badges: [{ label: "Aug 29, 2026" }],
                      },
                      link: { kind: "detail", itemId: "audit-2" },
                    },
                    {
                      id: "audit-3",
                      cells: {
                        when: "Aug 28, 2026",
                        actor: "Mira Reyes",
                        action: "Revoked account grants",
                        target: "Sam Lee",
                      },
                      compact: {
                        title: "Revoked account grants",
                        metadata: ["Mira Reyes", "Sam Lee"],
                        badges: [{ label: "Aug 28, 2026" }],
                      },
                      link: { kind: "detail", itemId: "audit-3" },
                    },
                  ],
                },
              },
            ],
          },
        ],
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
const sessions = [
  {
    id: "responsive",
    title: "Responsive console audit",
    lastActiveAt: "2026-07-10T12:04:00.000Z",
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
        source: { kind: "upload", id: "upload-verdigris" },
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

function activeSurfaces(activeId: string): Array<{
  id: string;
  label: string;
  href: string;
  isActive: boolean;
}> {
  return SURFACES.map((surface) => ({
    ...surface,
    isActive: surface.id === activeId,
  }));
}

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
    surfaces: [
      {
        id: "dashboard",
        label: "Dashboard",
        href: "/dashboard",
        isActive: true,
      },
    ],
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
          href: "/chat",
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
    `getComputedStyle(document.querySelector(${JSON.stringify(selector)})).display`,
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
    const crumbDisplay = await elementDisplay(page, ".studio > .crumbbar");
    if (crumbDisplay !== "none") {
      throw new Error(`Studio crumb bar exceeded the phone chrome budget`);
    }
    const head = await elementBounds(page, ".studio-page-head");
    if (!head || head.y > 170) {
      throw new Error(
        `Studio content starts too low at ${width}px (${head?.y ?? "missing"})`,
      );
    }
    const expectsPrimaryAction =
      surface === "studio-library" ||
      surface.startsWith("studio-administration-invitations");
    if (expectsPrimaryAction) {
      const action = await elementBounds(page, ".studio-page-head-action");
      if (
        !action ||
        action.y < -1 ||
        action.y + action.height > dimensions.clientHeight + 1 ||
        Math.abs(action.y + action.height - dimensions.clientHeight) > 2
      ) {
        throw new Error(
          `Studio primary action did not pin inside the phone viewport: ${JSON.stringify(action)}`,
        );
      }
    }
    const railState = await evaluatePage(page, () => {
      const rail = document.querySelector(".rail");
      if (!(rail instanceof HTMLElement)) return undefined;
      if (getComputedStyle(rail).display === "none") {
        return { visible: false, overflow: false, focusReached: true };
      }
      const buttons = rail.querySelectorAll<HTMLButtonElement>("button");
      if (buttons.length === 0) {
        return { visible: true, overflow: false, focusReached: false };
      }
      const last = buttons.item(buttons.length - 1);
      const overflow = rail.scrollWidth > rail.clientWidth + 1;
      last.focus();
      const focusReached = document.activeElement === last;
      last.blur();
      rail.scrollLeft = 0;
      return { visible: true, overflow, focusReached };
    });
    if (railState?.visible && !railState.overflow) {
      throw new Error(`Studio workspace rail did not expose phone overflow`);
    }
    if (railState?.focusReached === false) {
      throw new Error(
        `Studio keyboard focus could not reach the final rail item`,
      );
    }
    if (surface.startsWith("studio-administration")) {
      const compactDisplay = await elementDisplay(
        page,
        ".declarative-compact-rows",
      );
      const annotatedTableDisplay = await elementDisplay(
        page,
        '.declarative-table-scroll[data-has-unannotated="false"]',
      );
      if (compactDisplay === "none" || annotatedTableDisplay !== "none") {
        throw new Error(
          `Studio administration did not reflow its annotated phone rows`,
        );
      }
    }
  }
  if (
    surface.startsWith("studio-") &&
    surface !== "studio-library" &&
    surface !== "studio-account" &&
    surface !== "studio-overview" &&
    !surface.startsWith("studio-administration")
  ) {
    const modes = await elementDisplay(page, ".studio-mobile-modes");
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
await Promise.all([readFile(studioAsset), readFile(chatAsset)]).catch(() => {
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
const fixtureImage = PNG.sync.write(fixturePng);

const pendingUploadResponses = new Set<() => void>();
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
    if (url.pathname === "/chat")
      return new Response(
        climateHtml(
          renderChatPage({
            surfaces: activeSurfaces("web-chat"),
            sessionHref: "/logout",
          }),
          request,
        ),
        { headers: { "content-type": "text/html" } },
      );
    if (url.pathname === "/chat/assets/app.js")
      return new Response(await readFile(chatAsset), {
        headers: { "content-type": "text/javascript" },
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
      url.pathname === "/studio" ||
      url.pathname.startsWith("/studio/entities/") ||
      url.pathname.startsWith("/studio/workspaces/")
    )
      return new Response(
        climateHtml(
          renderEditorShellHtml({
            assetPath: "/studio/assets/app.js",
            basePath: "/studio",
            surfaces: activeSurfaces("studio"),
            sessionHref: "/logout",
            principal: { displayName: "Mira Reyes", role: "admin" },
          }),
          request,
        ),
        { headers: { "content-type": "text/html" } },
      );
    if (url.pathname.startsWith("/studio/assets/")) {
      const publicPath = url.pathname.slice("/studio/assets/".length);
      const filePath = publicPath === "app.js" ? "studio-app.js" : publicPath;
      if (
        !/^(?:studio-app\.js|studio-app\.js\.map|studio-chunks\/[A-Za-z0-9_-]+\.(?:js|js\.map))$/.test(
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
            badge: 3,
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
            badge: 2,
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
          data: overviewWorkspaceData,
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
          data:
            url.searchParams.get("tab") === "invitations"
              ? administrationInvitationsWorkspaceData
              : url.searchParams.get("tab") === "audit"
                ? administrationAuditWorkspaceData
                : administrationWorkspaceData,
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
  throw new Error("Set CONSOLE_CHROMIUM_PATH to a Chromium executable.");
}
const browserArgs = process.getuid?.() === 0 ? ["--no-sandbox"] : [];
const browserBackend: Bun.WebView.Backend = {
  type: "chrome",
  url: false,
  path: executablePath,
  ...(browserArgs.length > 0 ? { argv: browserArgs } : {}),
};
const failures: string[] = [];
try {
  for (const climate of CLIMATES) {
    for (const viewport of VIEWPORTS) {
      for (const surface of [
        "dashboard",
        "dashboard-knowledge",
        "dashboard-network",
        "chat",
        "chat-cards",
        "chat-empty",
        "chat-drawer",
        "studio-library",
        "studio-overview",
        "studio-administration",
        "studio-administration-invitations",
        "studio-administration-invitations-form",
        "studio-administration-audit",
        "studio-account",
        "studio-editor",
        "studio-delete",
        "studio-conflict",
        "studio-invalid",
        "studio-upload",
      ] as const) {
        // The sessions drawer only exists at phone widths.
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
        await page.cdp("Emulation.setLocaleOverride", { locale: "en-GB" });
        await addVisualInitScript(page, conversationId);
        const isStudioEditor = surface === "studio-editor" || isStudioSecondary;
        const route = isDashboard
          ? "/dashboard"
          : isChat
            ? "/chat"
            : surface === "studio-account"
              ? "/studio/workspaces/studio%3Aaccount"
              : surface === "studio-overview"
                ? "/studio/workspaces/studio%3Aoverview"
                : surface.startsWith("studio-administration")
                  ? "/studio/workspaces/admin%3Aadministration"
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
            : "";
        await navigateToNetworkIdle(
          page,
          `http://127.0.0.1:${server.port}${route}?climate=${climate}${workspaceQuery}${hash}`,
        );
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
          await waitForText(page, "While you were away");
        }
        if (surface === "studio-account") {
          await waitForText(page, "Signed-in sessions");
        }
        if (surface === "studio-administration-invitations-form") {
          await clickSelector(page, ".declarative-action-disclosure > summary");
        }
        if (surface === "studio-delete") {
          // Open the delete confirmation. Phone tucks the control behind
          // the ••• disclosure; wider widths show it in the pipeline bar.
          if (viewport.width <= 640) {
            await clickSelector(page, ".studio-mobile-more summary");
            await clickText(page, "button", "Delete entry");
          } else {
            await clickSelector(page, ".pipeline .btn.danger");
          }
          await waitForSelector(page, ".delete-modal");
        }
        if (surface === "studio-conflict") {
          // Save with an unchanged title: the fixture answers 409, raising
          // the reconcile card above the save bar.
          await clickSelector(page, ".save-btn");
          await waitForSelector(page, ".conflict");
        }
        if (surface === "studio-invalid") {
          // Two validation aspects in one frame: a server-rejected save
          // (the fixture 400s on "!!") pins the pipeline error line, then
          // an emptied required title pins the :user-invalid outline.
          await fillLabel(page, "Title", "Notes from the rhizome!!");
          await clickSelector(page, ".save-btn");
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
        page.close();
      }
    }
  }
} finally {
  Bun.WebView.closeAll();
  for (const release of pendingUploadResponses) release();
  await server.stop(true);
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
