import { bookmark, readingDigest } from "@fixture/reading-entities";
import { compileReadingDigest } from "@fixture/reading-insights";
import { defineEntity } from "@rizom/brain/entities";
import {
  defineAccountSettings,
  defineRoute,
  defineStudioWorkspace,
  defineDashboardWidget,
  defineServicePlugin,
  defineWorkspaceAction,
  protocol,
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

// A page a reader queued from Studio, owned by this package: a workspace
// action writes it as the operator who queued it, held to the action policy.
export const queuedReading = defineEntity({
  type: "queued-reading",
  purpose: "A page a reader queued from Studio to read later",
  metadata: z.object({
    title: z.string().min(1),
    sourceUrl: z.url(),
    notify: z.boolean(),
  }),
});

const READING_PROVIDER = "https://reading.example";

// Connecting the provider sends the reader's browser to its consent page. The
// runtime checks the destination against the declared origins before the
// browser moves.
const connectProvider = defineWorkspaceAction({
  name: "connect-provider",
  label: "Connect reading provider",
  permission: "trusted",
  input: z.object({}),
  launch: { origins: [READING_PROVIDER] },
});

/** How many items the reader's provider feed holds. Stubbed here. */
async function countFeedItems(
  feedUrl: string,
  accessToken: string,
): Promise<number> {
  if (!accessToken) throw new Error("The provider needs a token");
  return new URL(feedUrl).pathname.split("/").filter(Boolean).length;
}

/** The provider's half of consent: a code becomes a token. Stubbed here. */
async function exchangeCode(
  code: string,
): Promise<{ feedUrl: string; accessToken: string }> {
  if (!code) throw new Error("The provider returned no code");
  return {
    feedUrl: `${READING_PROVIDER}/feeds/${encodeURIComponent(code)}`,
    accessToken: `token-for-${code}`,
  };
}

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

// The URL state: a tag filter, and how a provider connection came back.
const connectionOutcome = z.enum(["connected", "declined", "failed"]);

const readingWorkspaceQuery = z.object({
  tag: z.string().optional(),
  connection: connectionOutcome.optional(),
});

const readingWorkspaceData = z.object({
  connected: z.boolean(),
  connection: connectionOutcome.optional(),
  selectedTag: z.string().optional(),
  bookmarks: z.array(readingRow),
  digestCount: z.number().int().nonnegative(),
  feedItems: z.number().int().nonnegative(),
});

type ReadingWorkspaceAction =
  typeof refreshDigest | typeof addReadingItem | typeof connectProvider;

const readingWorkspace = defineStudioWorkspace({
  id: "reading-library",
  label: "Reading library",
  description: "Review saved pages and refresh their durable digests.",
  priority: 40,
  permission: "trusted",
  entities: [bookmark, readingDigest],
  query: readingWorkspaceQuery,
  data: readingWorkspaceData,
  actions: [refreshDigest, addReadingItem, connectProvider],

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
    const connectionNotice: OperatorViewBlock<ReadingWorkspaceAction>[] =
      data.connection
        ? [
            {
              type: "notice",
              tone: data.connection === "connected" ? "good" : "warn",
              text: `The reading provider connection ${data.connection === "connected" ? "succeeded" : `was ${data.connection}`}.`,
            },
          ]
        : [];
    const blocks: OperatorViewBlock<ReadingWorkspaceAction>[] = [
      ...connectionNotice,
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
            label: "Feed items",
            value: data.feedItems,
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
      primaryAction: data.connected
        ? {
            action: refreshDigest,
            input: { bookmarkId: data.bookmarks[0]?.id ?? "all" },
          }
        : { action: connectProvider, input: {} },
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

export default defineServicePlugin(
  {
    id: "reading-operator",
    config: z.object({}),
    accountSettings: readingAccountSettings,
    entities: [queuedReading],
  },
  {
    // The provider sends the reader's browser back here with the state the
    // connect action claimed. Redeeming it writes that reader's settings, and
    // only from a session of the account that started: the runtime checks
    // the session, so the package never sees one.
    routes: ({ accountSettings }) => [
      defineRoute({
        method: "GET",
        path: "/reading-operator/consent/return",
        security: protocol({
          authenticate: ({ request }) =>
            new URL(request.url).searchParams.has("state")
              ? { id: "reading-provider" }
              : null,
        }),
        // The browser lands back in the workspace, with how it went.
        returnTo: readingWorkspace,
        async handle({ request }) {
          const params = new URL(request.url).searchParams;
          if (params.has("error")) return { connection: "declined" };
          try {
            // A bad state is refused before the code is exchanged.
            await accountSettings.redeem(params.get("state") ?? "", () =>
              exchangeCode(params.get("code") ?? ""),
            );
            return { connection: "connected" };
          } catch {
            // Refused or failed, the reader is told so and connects again.
            return { connection: "failed" };
          }
        },
      }),
    ],

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
        async ({ input, entities, signal }) => {
          signal.throwIfAborted();
          const { id } = await entities.create(queuedReading, {
            content: input.title,
            metadata: {
              title: input.title,
              sourceUrl: input.sourceUrl,
              notify: input.notify,
            },
            visibility:
              input.visibility === "private" ? "restricted" : "shared",
          });
          return {
            status: `${input.title} queued as ${id}${input.notify ? " with notification" : ""}`,
            sourceUrl: input.sourceUrl,
          };
        },
      );

      // The claim names the operator's account and the Studio session they
      // act in; the consent URL carries it to the provider and back.
      const connectProviderHandler = connectProvider.bind(
        context,
        async ({ accountSettings }) => {
          const consent = new URL("/consent", READING_PROVIDER);
          consent.searchParams.set("state", await accountSettings.claim());
          return { url: consent.href };
        },
      );

      return [
        readingWorkspace.bind(context, {
          actions: [
            refreshDigestHandler,
            addReadingItemHandler,
            connectProviderHandler,
          ],
          async load({ entities, settings, accountSettings, signal, query }) {
            signal.throwIfAborted();
            const selected = query.get(readingWorkspaceQuery);
            // The token is read server-side, sealed: only reveal() gives the
            // string, and printed or serialized it is a redacted marker.
            const connection = await accountSettings.read();
            const feedItems = connection
              ? await countFeedItems(
                  connection.feedUrl,
                  connection.accessToken.reveal(),
                )
              : 0;
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
              ...(selected.connection
                ? { connection: selected.connection }
                : {}),
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
              feedItems,
            };
          },
        }),
      ];
    },
  },
);
