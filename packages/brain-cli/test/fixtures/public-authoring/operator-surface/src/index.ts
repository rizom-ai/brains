import { bookmark, readingDigest } from "@fixture/reading-entities";
import { compileReadingDigest } from "@fixture/reading-insights";
import {
  defineAccountSettings,
  defineCmsWorkspace,
  defineDashboardWidget,
  defineServicePlugin,
  defineWorkspaceAction,
  z,
} from "@rizom/brain/services";

// Account settings are principal-owned rather than deployment-owned. Field
// metadata drives the Account form; the schema remains the only value contract.
const readingAccountSettings = defineAccountSettings({
  title: "Reading provider",
  description: "Connect a private reading feed to this Brain account.",
  schema: z.object({
    feedUrl: z.url(),
    accessToken: z.string().min(1),
  }),
  fields: {
    feedUrl: {
      label: "Feed URL",
      control: "url",
    },
    accessToken: {
      label: "Access token",
      secret: true,
    },
  },
});

const refreshDigest = defineWorkspaceAction({
  name: "refresh-digest",
  label: "Refresh digest",
  input: z.object({ bookmarkId: z.string() }),
  output: z.object({ jobId: z.string() }),
  permission: "trusted",
  async execute({ input, jobs, signal }) {
    signal.throwIfAborted();
    const job = await jobs.enqueue(compileReadingDigest, input);
    return { jobId: job.id };
  },
});

const readingRow = z.object({
  id: z.string(),
  title: z.string(),
  tags: z.array(z.string()),
  wordCount: z.number().int().nonnegative().optional(),
});

const readingWorkspaceData = z.object({
  connected: z.boolean(),
  bookmarks: z.array(readingRow),
  digestCount: z.number().int().nonnegative(),
});

const readingWorkspace = defineCmsWorkspace({
  id: "reading-library",
  label: "Reading library",
  description: "Review saved pages and refresh their durable digests.",
  priority: 40,
  permission: "trusted",
  entities: [bookmark, readingDigest],
  data: readingWorkspaceData,
  actions: [refreshDigest],

  async load({ entities, settings, signal }) {
    signal.throwIfAborted();
    const [bookmarks, digests] = await Promise.all([
      entities.list(bookmark),
      entities.list(readingDigest),
    ]);
    const digestByBookmark = new Map(
      digests.map((digest) => [digest.metadata.bookmarkId, digest]),
    );

    return {
      connected: settings !== null,
      bookmarks: bookmarks.map((saved) => {
        const digest = digestByBookmark.get(saved.id);
        return {
          id: saved.id,
          title: saved.metadata.title,
          tags: saved.metadata.tags,
          ...(digest ? { wordCount: digest.metadata.wordCount } : {}),
        };
      }),
      digestCount: digests.length,
    };
  },

  view({ data }) {
    return {
      title: "Reading library",
      blocks: [
        {
          type: "stats",
          items: [
            {
              label: "Bookmarks",
              value: data.bookmarks.length,
            },
            {
              label: "Digests",
              value: data.digestCount,
            },
            {
              label: "Reading provider",
              value: data.connected ? "connected" : "not connected",
              tone: data.connected ? "good" : "neutral",
            },
          ],
        },
        {
          type: "table",
          id: "bookmarks",
          empty: "No bookmarks have been saved yet.",
          columns: [
            { key: "title", label: "Title" },
            { key: "tags", label: "Tags" },
            { key: "wordCount", label: "Words", align: "end" },
          ],
          rows: data.bookmarks.map((saved) => ({
            id: saved.id,
            cells: {
              title: saved.title,
              tags: saved.tags.join(", "),
              wordCount: saved.wordCount ?? "—",
            },
            actions: [
              {
                action: refreshDigest,
                input: { bookmarkId: saved.id },
              },
            ],
          })),
        },
      ],
    };
  },
});

const readingWidgetData = z.object({
  connected: z.boolean(),
  bookmarks: z.number().int().nonnegative(),
  digests: z.number().int().nonnegative(),
  missingDigests: z.number().int().nonnegative(),
});

const readingWidget = defineDashboardWidget({
  id: "reading-library",
  title: "Reading library",
  description: "Saved pages and digest coverage.",
  group: "knowledge",
  placement: "secondary",
  priority: 40,
  permission: "trusted",
  data: readingWidgetData,
  workspace: readingWorkspace,

  async load({ entities, settings, signal }) {
    signal.throwIfAborted();
    const [bookmarks, digests] = await Promise.all([
      entities.list(bookmark),
      entities.list(readingDigest),
    ]);
    const covered = new Set(
      digests.map((digest) => digest.metadata.bookmarkId),
    );

    return {
      connected: settings !== null,
      bookmarks: bookmarks.length,
      digests: digests.length,
      missingDigests: bookmarks.filter((saved) => !covered.has(saved.id))
        .length,
    };
  },

  digest({ data }) {
    return {
      items: [
        { label: "Bookmarks", value: String(data.bookmarks) },
        { label: "Digests", value: String(data.digests) },
      ],
      attention: data.missingDigests,
    };
  },

  view({ data }) {
    return {
      blocks: [
        {
          type: "stats",
          items: [
            { label: "Saved", value: data.bookmarks },
            { label: "Digested", value: data.digests },
            {
              label: "Missing",
              value: data.missingDigests,
              tone: data.missingDigests > 0 ? "warn" : "good",
            },
          ],
        },
        ...(!data.connected
          ? [
              {
                type: "notice",
                tone: "neutral",
                text: "Connect a reading provider from Account settings.",
              },
            ]
          : []),
      ],
    };
  },
});

export default defineServicePlugin({
  id: "reading-operator",
  config: z.object({}),
  accountSettings: readingAccountSettings,

  // Only the current caller's parsed settings reach these loaders. Broad
  // account reconciliation belongs to supervised interface capabilities.
  dashboardWidgets: () => [readingWidget],
  cmsWorkspaces: () => [readingWorkspace],
});
