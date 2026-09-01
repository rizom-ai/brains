import { bookmark, readingDigest } from "@fixture/reading-entities";
import { compileReadingDigest } from "@fixture/reading-insights";
import {
  defineAccountSettings,
  defineStudioWorkspace,
  defineDashboardWidget,
  defineServicePlugin,
  defineWorkspaceAction,
  z,
  type DashboardOperatorViewBlock,
  type OperatorViewBlock,
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
  confirmation: { kind: "prepared" },
  input: z.object({ bookmarkId: z.string() }),
  output: z.object({ jobId: z.string() }),
  permission: "trusted",
});

const addReadingItem = defineWorkspaceAction({
  name: "add-reading-item",
  label: "Add reading item",
  input: z.object({
    requestId: z.string(),
    title: z.string().min(1),
    sourceUrl: z.url(),
    visibility: z.enum(["shared", "private"]),
    notify: z.boolean(),
  }),
  output: z.object({ status: z.string(), sourceUrl: z.url() }),
  permission: "trusted",
});

const readingRow = z.object({
  id: z.string(),
  title: z.string(),
  tags: z.array(z.string()),
  wordCount: z.number().int().nonnegative().optional(),
});

const readingWorkspaceQuery = z.object({
  tag: z.string().optional(),
});

const readingWorkspaceData = z.object({
  connected: z.boolean(),
  selectedTag: z.string().optional(),
  bookmarks: z.array(readingRow),
  digestCount: z.number().int().nonnegative(),
});

type ReadingWorkspaceAction = typeof refreshDigest | typeof addReadingItem;

const readingWorkspace = defineStudioWorkspace({
  id: "reading-library",
  label: "Reading library",
  description: "Review saved pages and refresh their durable digests.",
  priority: 40,
  permission: "trusted",
  entities: [bookmark, readingDigest],
  query: readingWorkspaceQuery,
  data: readingWorkspaceData,
  actions: [refreshDigest, addReadingItem],

  view({ data }) {
    const tagQuery = {
      controls: [
        {
          key: "tag",
          label: "Tag",
          value: data.selectedTag,
          allLabel: "All tags",
          options: [...new Set(data.bookmarks.flatMap((saved) => saved.tags))]
            .sort()
            .map((tag) => ({ value: tag, label: tag })),
        },
      ],
    };
    const blocks: OperatorViewBlock<ReadingWorkspaceAction>[] = [
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
        type: "text",
        id: "reading-guidance",
        label: "Reader guide",
        text: "Filter the library, then refresh any digest that needs an update.",
      },
      {
        type: "card",
        id: "add-reading-item",
        label: "Add reading item",
        blocks: [
          {
            type: "action",
            action: addReadingItem,
            input: { requestId: "reading-library-form" },
            form: {
              submitLabel: "Add item",
              fields: {
                title: { label: "Title", control: "text" },
                sourceUrl: { label: "Source URL", control: "url" },
                visibility: {
                  label: "Visibility",
                  control: "select",
                  options: [
                    { value: "shared", label: "Shared" },
                    { value: "private", label: "Private" },
                  ],
                },
                notify: { label: "Notify me", control: "checkbox" },
              },
            },
            result: {
              title: "Reading item accepted",
              fields: {
                status: { label: "Status" },
                sourceUrl: { label: "Source URL", copyable: true },
              },
            },
          },
        ],
      },
      {
        type: "table",
        id: "bookmarks",
        empty: "No bookmarks have been saved yet.",
        query: tagQuery,
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
          compact: {
            title: saved.title,
            metadata: [
              saved.tags.join(" · "),
              saved.wordCount === undefined
                ? "Word count pending"
                : `${saved.wordCount} words`,
            ],
            count: saved.wordCount,
            tone: "neutral",
          },
          actions: [
            {
              action: refreshDigest,
              input: { bookmarkId: saved.id },
            },
          ],
        })),
      },
    ];
    return {
      title: "Reading library",
      primaryAction: {
        action: refreshDigest,
        input: { bookmarkId: data.bookmarks[0]?.id ?? "all" },
      },
      blocks,
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
    const stats: DashboardOperatorViewBlock = {
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
    };
    if (data.connected) return { blocks: [stats] };
    return {
      blocks: [
        stats,
        {
          type: "notice",
          tone: "neutral",
          text: "Connect a reading provider from Account settings.",
        },
      ],
    };
  },
});

export default defineServicePlugin({
  id: "reading-operator",
  config: z.object({}),
  accountSettings: readingAccountSettings,

  // Contracts stay at module scope; executors bind once after setup. Only the
  // current caller's parsed settings reach loaders/actions at request time.
  dashboardWidgets: (context) => [
    readingWidget.bind(context, async ({ entities, settings, signal }) => {
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
    }),
  ],

  studioWorkspaces: (context) => {
    const refreshDigestHandler = refreshDigest.bind(
      context,
      async ({ input, jobs, signal }) => {
        signal.throwIfAborted();
        const job = await jobs.enqueue(compileReadingDigest, input);
        return { jobId: job.id };
      },
      ({ input }) => ({
        summary: `Refresh the digest for ${input.bookmarkId}?`,
        revision: input.bookmarkId,
      }),
    );

    const addReadingItemHandler = addReadingItem.bind(
      context,
      async ({ input, signal }) => {
        signal.throwIfAborted();
        return {
          status: `${input.title} queued as ${input.visibility}${input.notify ? " with notification" : ""}`,
          sourceUrl: input.sourceUrl,
        };
      },
    );

    return [
      readingWorkspace.bind(context, {
        actions: [refreshDigestHandler, addReadingItemHandler],
        async load({ entities, settings, signal, query }) {
          signal.throwIfAborted();
          const selected = query.get(readingWorkspaceQuery);
          const [allBookmarks, digests] = await Promise.all([
            entities.list(bookmark),
            entities.list(readingDigest),
          ]);
          const digestByBookmark = new Map(
            digests.map((digest) => [digest.metadata.bookmarkId, digest]),
          );
          const bookmarks = selected.tag
            ? allBookmarks.filter((saved) =>
                saved.metadata.tags.includes(selected.tag ?? ""),
              )
            : allBookmarks;

          return {
            connected: settings !== null,
            ...(selected.tag ? { selectedTag: selected.tag } : {}),
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
      }),
    ];
  },
});
