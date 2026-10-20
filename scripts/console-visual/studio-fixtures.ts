import { systemFixtures } from "../fixtures/studio-system";
import type { StudioStudyState } from "../fixtures/studio-study-state";

const editCapabilities = {
  canRead: true,
  canCreate: true,
  canUpdate: true,
  canDelete: true,
  canExtract: true,
  canPublish: true,
  canAssist: true,
};

export const types = [
  {
    entityType: "posts",
    classification: "content",
    label: "Field notes",
    singularLabel: "Field note",
    isSingleton: false,
    hasBody: true,
    count: 54,
    capabilities: editCapabilities,
  },
  {
    entityType: "docs",
    classification: "content",
    label: "Documentation",
    singularLabel: "Documentation",
    isSingleton: false,
    hasBody: true,
    count: 7,
    capabilities: editCapabilities,
  },
  {
    entityType: "settings",
    classification: "system",
    label: "Site settings",
    singularLabel: "Site setting",
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
      singularLabel: "Anchor Profile",
      isSingleton: true,
      count: 1,
    },
    {
      entityType: "brain-character",
      label: "Brain Characters",
      singularLabel: "Brain Character",
      isSingleton: true,
      count: 1,
    },
    {
      entityType: "style-guide",
      label: "Style Guides",
      singularLabel: "Style Guide",
      isSingleton: true,
      count: 1,
    },
    {
      entityType: "prompt",
      label: "Prompts",
      singularLabel: "Prompt",
      isSingleton: false,
      count: 18,
    },
    {
      entityType: "skill",
      label: "Skills",
      singularLabel: "Skill",
      isSingleton: false,
      count: 3,
    },
    {
      entityType: "agent",
      label: "Agents",
      singularLabel: "Agent",
      isSingleton: false,
      count: 15,
    },
  ].map((info) => ({
    ...info,
    classification: "system",
    hasBody: true,
    capabilities: editCapabilities,
  })),
);
export const entities = [
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
export const entity = {
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
  body: '# Notes from the rhizome\n\nA good console should make dense systems feel calm. Its structure needs to remain legible while the viewport changes around it.\n\n```ts\nconst manuscript = { source: "literal", preview: "rendered" };\nconst scrolling = "independent"; // Preserve source bytes.\nconst pageSize = 25;\n```\n\n| Surface | Reading mode | Records | Keyboard access |\n| --- | --- | ---: | --- |\n| Library | Paged list | 54 | Search, filter, then open |\n| Preview | Markdown | 2 | Scroll code and tables |\n\n> The interface is not a dashboard pasted onto every screen. It is a continuous instrument with distinct working climates.\n\n## Responsive field rules\n\n- Keep shared wayfinding stable.\n- Let local tools adapt to the task.\n- Preserve touch targets and safe areas.\n\nThe result should feel authored at every width. Keep the [field notes](https://example.org/field-notes) close.',
  contentHash: "fixture-hash",
  created: "2026-06-18T09:00:00.000Z",
};
/** What one entry of each system fixture is called, as the types API sends it. */
const systemSingular: Record<string, string> = {
  "Anchor Profiles": "Anchor Profile",
  "Brain Characters": "Brain Character",
  "Style Guides": "Style Guide",
  Prompts: "Prompt",
  Skills: "Skill",
  Playbooks: "Playbook",
  "SWOT analyses": "SWOT analysis",
  Agents: "Agent",
  "Site Info": "Site Info",
};
export const systemTypes = [...systemFixtures.values()].map((fixture) => ({
  entityType: fixture.entityType,
  classification: "system",
  label: fixture.label,
  singularLabel: systemSingular[fixture.label] ?? fixture.label,
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
export const sessions = [
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
export const messages = [
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
      "The Studio preserves its warm editorial climate. Desktop separates colophon from manuscript; tablet and phone retain Details, Write, and Preview. The [release checklist](https://example.org/release) has the rest.",
  },
];
// A second, short session pinning the dynamic message states the mockups
// specify: user upload chip, retrieved-source citations, suggested actions,
// and an exported attachment card. Cards render as <details>; the capture
// opens them. Short enough that the whole exchange fits at 1440×1000.
export const cardMessages = [
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

/** Studio's workspace registry, carrying the badges its providers report. */
export function studioWorkspaces(badges: {
  overview: number;
  administration: number;
}): Array<Record<string, unknown>> {
  return [
    {
      id: "studio:overview",
      pluginId: "studio",
      label: "Overview",
      rendererName: "DeclarativeOperatorWorkspace",
      priority: -100,
      permission: "trusted",
      entityTypes: [],
      badge: badges.overview,
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
      badge: badges.administration,
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
  ];
}

/** The signed-in account; the empty study state keeps only what must remain. */
export function accountFixture(
  studyState: StudioStudyState | undefined,
): Record<string, unknown> {
  return {
    ...(studyState === "empty"
      ? { profileEntityId: "anchor-profile/anchor-profile" }
      : {}),
    displayName: "Mira Reyes",
    role: "admin",
    connectedChannels:
      studyState === "empty"
        ? []
        : [
            {
              type: "email",
              label: "mira@example.com",
              verifiedAt: 1_735_689_600_000,
            },
          ],
    pluginSettings:
      studyState === "empty"
        ? []
        : [
            {
              id: "mailbox",
              title: "Personal mailbox",
              configured: true,
              revision: 1,
              description:
                "Mailbox settings for your account, not the brain’s shared email service.",
              fields: [
                {
                  name: "host",
                  label: "IMAP host",
                  control: "text",
                  secret: false,
                  required: true,
                  value: "imap.example.test",
                },
                {
                  name: "password",
                  label: "Password",
                  control: "text",
                  secret: true,
                  required: true,
                  set: true,
                },
              ],
            },
          ],
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
    ].slice(0, studyState === "empty" ? 1 : undefined),
  };
}

/** The post schema the editor renders: every widget the colophon uses. */
export const postsSchema = {
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
};
