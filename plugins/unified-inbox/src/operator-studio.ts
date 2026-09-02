import {
  defineStudioWorkspace,
  defineWorkspaceAction,
  z,
  type OperatorCaller,
  type OperatorCapabilityDefinition,
  type OperatorQueryReader,
  type OperatorViewBlock,
  type StudioWorkspaceDefinition,
  type WorkspaceActionDefinition,
  type WorkspacePreparedConfirmation,
} from "@brains/sdk/services";
import { defineEntity } from "@brains/sdk/entities";
import type { InboxOperatorService } from "./operator-service";
import {
  inboxDetailOutcomeSchema,
  inboxRowId,
  inboxWorkspaceQuerySchema,
  inboxWorkspaceSnapshotSchema,
  splitInboxRowId,
  type InboxDetailOutcome,
  type InboxWorkspaceQuery,
  type InboxWorkspaceSnapshot,
} from "./schemas";

const inboxCapabilitySchema = z.object({
  id: z.string().trim().min(1).max(120),
  label: z.string().trim().min(1).max(200),
  confirmation: z.literal("prepared").optional(),
});
/** What running one source-owned action needs to know. */
export interface InboxActionInput {
  readonly sourceId: string;
  readonly itemId: string;
  readonly capability: OperatorCapabilityDefinition;
}

const inboxActionInputSchema: z.ZodType<InboxActionInput> = z.object({
  sourceId: z.string().trim().min(1).max(120),
  itemId: z.string().trim().min(1).max(500),
  capability: inboxCapabilitySchema,
});

export const runInboxAction: WorkspaceActionDefinition<
  "run-inbox-action",
  z.ZodType<InboxActionInput>,
  z.ZodType<{ kind: "completed" }>
> = defineWorkspaceAction({
  name: "run-inbox-action",
  label: "Run inbox action",
  catalog: true,
  permission: "admin",
  confirmation: { kind: "prepared", conditional: true },
  input: inboxActionInputSchema,
  output: z.object({ kind: z.literal("completed") }),
});

/** How much source text the reading pane shows before saying it stopped. */
const DETAIL_TEXT_LIMIT = 4000;

const personEntity = defineEntity({
  type: "person",
  purpose: "A known person associated with operator work",
  metadata: z.object({}),
});

function normalizeFlatInboxQuery(input: unknown): unknown {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return input;
  }
  const base: Record<string, unknown> = {};
  const facets: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (key.startsWith("facet.")) facets[key.slice("facet.".length)] = value;
    else base[key] = value;
  }
  return {
    ...base,
    ...(Object.keys(facets).length > 0 ? { facets } : {}),
  };
}

const declarativeInboxQuerySchema = z.preprocess(
  normalizeFlatInboxQuery,
  inboxWorkspaceQuerySchema,
);
/** What one render of the workspace is made of. */
export interface InboxWorkspaceData {
  readonly query: InboxWorkspaceQuery;
  readonly snapshot: InboxWorkspaceSnapshot;
  readonly detail?: InboxDetailOutcome | undefined;
}

const declarativeInboxDataSchema: z.ZodType<InboxWorkspaceData> = z.object({
  query: inboxWorkspaceQuerySchema,
  snapshot: inboxWorkspaceSnapshotSchema,
  detail: inboxDetailOutcomeSchema.optional(),
});

/**
 * The filter is where a source is chosen, so it carries what distinguishes one:
 * its open count, its urgent share, and whether it can be read at all. The
 * option list covers every registered source regardless of the active filter,
 * so an unreachable source stays visible even while filtered away from it.
 */
function sourceOptionLabel(
  source: InboxWorkspaceSnapshot["sources"][number],
): string {
  const name = source.source.displayName;
  if (!source.available) return `${name} · unavailable`;
  return source.high > 0 ? `${name} · ${source.high} high` : name;
}

type InboxEntry = InboxWorkspaceSnapshot["entries"][number];
type InboxViewBlock = OperatorViewBlock<typeof runInboxAction>;
type InboxLink = Extract<InboxViewBlock, { type: "links" }>["items"][number];
type InboxPanelBlock = NonNullable<
  Extract<InboxViewBlock, { type: "detail" }>["open"]
>["blocks"][number];
type InboxCardBlock = Extract<InboxPanelBlock, { type: "card" }>;

/** The verbs that clear an item, offered by its own source. */
function entryActions(entry: InboxEntry): {
  action: typeof runInboxAction;
  capability: OperatorCapabilityDefinition;
  input: {
    sourceId: string;
    itemId: string;
    capability: OperatorCapabilityDefinition;
  };
}[] {
  return entry.item.actions.map((action) => {
    const capability: OperatorCapabilityDefinition = {
      id: action.id,
      label: action.label,
      ...(action.confirm === true ? { confirmation: "prepared" } : {}),
    };
    return {
      action: runInboxAction,
      capability,
      input: {
        sourceId: entry.source.sourceId,
        itemId: entry.item.id,
        capability,
      },
    };
  });
}

/** Where an item can be taken next, once it has been read. */
function entryFollowUps(entry: InboxEntry): InboxLink[] {
  const entityRef = entry.item.entityRef;
  const links: InboxLink[] = [];
  if (entry.item.contact?.personId) {
    links.push({
      label: `Open contact ${entry.item.contact.label}`,
      target: { entity: personEntity, id: entry.item.contact.personId },
    });
  }
  for (const followUp of entry.followUps) {
    if (followUp.kind === "discuss-in-chat") {
      links.push({
        label: followUp.label,
        target: {
          launch: {
            target: "inbox-discuss-in-chat",
            sourceId: entry.source.sourceId,
            itemId: entry.item.id,
            label: entry.item.title,
          },
        },
      });
    } else if (followUp.kind === "open-entity" && entityRef) {
      links.push({
        label: followUp.label,
        target: {
          launch: {
            target: "inbox-open-entity",
            entityType: entityRef.entityType,
            entityId: entityRef.entityId,
          },
        },
      });
    } else if (followUp.kind === "capture-as-note" && entityRef) {
      links.push({
        label: followUp.label,
        target: {
          launch: {
            target: "inbox-capture-note",
            title: entry.item.title,
            ...(entry.item.summary ? { summary: entry.item.summary } : {}),
            entityType: entityRef.entityType,
            entityId: entityRef.entityId,
          },
        },
      });
    }
  }
  return links;
}

function followUpsCard(items: InboxLink[]): InboxCardBlock {
  return {
    type: "card",
    id: "inbox-detail-follow-ups",
    label: "Follow up",
    blocks: [
      {
        type: "links",
        id: "inbox-follow-up-links",
        items,
      },
    ],
  };
}

function actionsCard(items: ReturnType<typeof entryActions>): InboxCardBlock {
  return {
    type: "card",
    id: "inbox-detail-actions",
    label: "Available actions",
    blocks: [
      {
        type: "actions",
        id: "inbox-action-controls",
        items,
      },
    ],
  };
}

/**
 * A row's timestamp is read, not parsed. The protocol carries metadata as
 * opaque strings, so the source that knows a value is a time is the one that
 * has to render it — the host cannot tell a timestamp from any other string
 * without guessing at its shape.
 *
 * Absolute rather than relative: this snapshot is cached and re-served, so a
 * "2 hours ago" computed here would age against the reader.
 */
export function formatReceivedAt(iso: string): string {
  const received = new Date(iso);
  if (Number.isNaN(received.getTime())) return iso;
  return received.toISOString().replace("T", " ").slice(0, 16) + " UTC";
}

export const inboxWorkspace: StudioWorkspaceDefinition<
  "inbox",
  z.ZodType<InboxWorkspaceData>,
  readonly [typeof runInboxAction]
> = defineStudioWorkspace({
  id: "inbox",
  label: "Inbox",
  priority: 20,
  permission: "admin",
  query: declarativeInboxQuerySchema,
  data: declarativeInboxDataSchema,
  actions: [runInboxAction],
  badge: ({ data }) => data.snapshot.summary.open,
  view: ({ data }) => {
    const { query, snapshot } = data;
    const selectedSource = snapshot.sources.find(
      (source) => source.source.sourceId === query.sourceId,
    );
    const queryControls: Extract<
      InboxViewBlock,
      { type: "query" }
    >["controls"] = [
      {
        key: "sourceId",
        label: "Source",
        value: query.sourceId,
        allLabel: "All sources",
        options: snapshot.sources.map((source) => ({
          value: source.source.sourceId,
          label: sourceOptionLabel(source),
          count: source.open,
        })),
      },
      {
        key: "urgency",
        label: "Urgency",
        value: query.urgency,
        allLabel: "All urgency",
        options: [
          {
            value: "high",
            label: "High priority",
            count: snapshot.summary.high,
          },
          { value: "normal", label: "Normal" },
        ],
      },
      ...(selectedSource?.source.facets ?? []).map((facet) => ({
        key: `facet.${facet.key}`,
        label: facet.label,
        value: query.facets?.[facet.key],
        allLabel: "All",
        options: facet.values,
      })),
    ];
    const errorBlocks: InboxViewBlock[] = snapshot.errors.map(
      (error, index) => ({
        type: "notice",
        id: `source-error-${index + 1}`,
        title: error.source.displayName,
        text: "This inbox source is temporarily unavailable.",
        tone: "warn",
      }),
    );
    const detailPanels: InboxPanelBlock[] | undefined = data.detail
      ? data.detail.kind === "detail"
        ? [
            {
              type: "text",
              id: "inbox-detail-text",
              label: "Original content",
              text: data.detail.detail.text.slice(0, DETAIL_TEXT_LIMIT),
              truncated:
                data.detail.detail.truncated ||
                data.detail.detail.text.length > DETAIL_TEXT_LIMIT,
            },
          ]
        : [
            {
              type: "notice",
              id: "inbox-detail-unavailable",
              title: "Original content",
              text: data.detail.error,
              tone: "warn",
            },
          ]
      : undefined;
    const selectedEntry = query.selected
      ? (snapshot.selectedEntry ??
        snapshot.entries.find(
          (entry) =>
            inboxRowId(entry.source.sourceId, entry.item.id) === query.selected,
        ))
      : undefined;
    const selectedTitle = selectedEntry?.item.title;
    // The pane is where the item is read, so it carries where it can go next
    // and the verbs that clear it — no going back to the row to act.
    const selectedFollowUps = selectedEntry
      ? entryFollowUps(selectedEntry)
      : [];
    const paneBlocks: InboxPanelBlock[] = [...(detailPanels ?? [])];
    if (selectedFollowUps.length > 0) {
      paneBlocks.push(followUpsCard(selectedFollowUps));
    }
    const selectedActions = selectedEntry ? entryActions(selectedEntry) : [];
    if (selectedActions.length > 0) {
      paneBlocks.push(actionsCard(selectedActions));
    }
    const blocks: InboxViewBlock[] = [
      {
        type: "stats",
        id: "inbox-summary",
        items: [
          {
            label: "Open",
            value: snapshot.summary.open,
            caption: "across sources",
          },
          {
            label: "High priority",
            value: snapshot.summary.high,
            caption:
              snapshot.summary.high > 0 ? "needs attention" : "all clear",
            tone: snapshot.summary.high > 0 ? "warn" : "good",
          },
          {
            label: "Matching",
            value: snapshot.total,
            caption: "current filter",
          },
        ],
      },
      // A dead source sits above the work it would have contributed, so the
      // operator sees it before scanning rows — but below the summary, whose
      // leading stats block is what the page head promotes into its totals.
      ...errorBlocks,
      {
        type: "query",
        id: "inbox-query",
        controls: queryControls,
        pagination: {
          offset: snapshot.offset,
          limit: snapshot.limit,
          total: snapshot.total,
        },
      },
      {
        type: "detail",
        id: "inbox-detail",
        queryKey: "selected",
        empty: "Select an item to read its source content.",
        ...(query.selected && paneBlocks.length > 0
          ? {
              open: {
                forId: query.selected,
                title: selectedTitle ?? "Original content",
                blocks: paneBlocks,
              },
            }
          : {}),
        master: {
          type: "list",
          id: "inbox-items",
          empty: "Nothing needs attention for these filters.",
          // A row carries what you scan and the verbs that clear it. Follow-ups
          // — go elsewhere and do something — are decisions made after reading,
          // so they live in the pane where the reading happens.
          items: snapshot.entries.map((entry) => ({
            id: inboxRowId(entry.source.sourceId, entry.item.id),
            title: entry.item.title,
            link: {
              detail: {
                itemId: inboxRowId(entry.source.sourceId, entry.item.id),
              },
            },
            description: entry.item.summary,
            metadata: [
              entry.source.displayName,
              formatReceivedAt(entry.item.receivedAt),
              ...(entry.item.threadOrdinal === undefined
                ? []
                : [`Message ${entry.item.threadOrdinal} in thread`]),
            ],
            badges: [
              {
                label: `${entry.item.urgency} priority`,
                tone: entry.item.urgency === "high" ? "warn" : "neutral",
              },
            ],
            actions: entryActions(entry),
          })),
        },
      },
    ];
    const online = snapshot.sources.filter((source) => source.available).length;
    return {
      kicker: "Live source-owned attention",
      title: "Inbox",
      description:
        "Triage incoming work without creating a second copy of source state.",
      status: {
        label: `${online} of ${snapshot.sources.length} sources online`,
        ...(online < snapshot.sources.length
          ? { detail: "some sources unavailable" }
          : {}),
        tone: online < snapshot.sources.length ? "warn" : "good",
      },
      blocks,
    };
  },
});

/**
 * What the workspace does, separate from what it looks like.
 *
 * Handed to `inboxWorkspace.bind` where the package declares its workspaces.
 * The binding context is the runtime's to supply, so it is passed in rather
 * than reached for.
 */
export interface InboxWorkspaceHandlers {
  load: (context: {
    readonly query: OperatorQueryReader;
    readonly caller: OperatorCaller | null | undefined;
    readonly signal: AbortSignal;
  }) => Promise<InboxWorkspaceData>;
  act: (context: {
    readonly input: InboxActionInput;
    readonly caller: OperatorCaller | null | undefined;
  }) => Promise<{ kind: "completed" }>;
  prepare: (context: {
    readonly input: InboxActionInput;
  }) => Promise<WorkspacePreparedConfirmation>;
}

export function inboxWorkspaceHandlers(
  operator: InboxOperatorService,
): InboxWorkspaceHandlers {
  return {
    load: async ({ query, caller, signal }): Promise<InboxWorkspaceData> => {
      if (!caller) throw new Error("Unified inbox requires authentication");
      const normalized = query.get(declarativeInboxQuerySchema);
      const actor = { permissionLevel: caller.permission };
      const snapshot = await operator.workspace(normalized, actor);
      const selection = normalized.selected
        ? splitInboxRowId(normalized.selected)
        : undefined;
      // A source that cannot be read is answered from the snapshot, so the
      // pane opens at once instead of waiting on a fetch that will fail.
      const selectedEntry = selection
        ? (snapshot.selectedEntry ??
          snapshot.entries.find(
            (entry) =>
              entry.source.sourceId === selection.sourceId &&
              entry.item.id === selection.itemId,
          ))
        : undefined;
      const detail: InboxDetailOutcome | undefined = !selection
        ? undefined
        : selectedEntry?.detailAvailable === false
          ? {
              kind: "detail-unavailable",
              error: "Original content is unavailable",
            }
          : await operator.detail(
              {
                type: "detail",
                sourceId: selection.sourceId,
                itemId: selection.itemId,
              },
              actor,
              signal,
            );
      return {
        query: normalized,
        snapshot,
        ...(detail ? { detail } : {}),
      };
    },
    act: async ({ input, caller }): Promise<{ kind: "completed" }> => {
      if (!caller) {
        throw new Error("Unified inbox requires authentication");
      }
      const outcome = await operator.act(
        {
          sourceId: input.sourceId,
          itemId: input.itemId,
          actionId: input.capability.id,
          confirmed: true,
        },
        { permissionLevel: caller.permission },
      );
      if (outcome.kind !== "completed") {
        throw new Error("Inbox action did not complete");
      }
      return outcome;
    },
    prepare: async ({ input }) =>
      operator.prepareAction({
        sourceId: input.sourceId,
        itemId: input.itemId,
        actionId: input.capability.id,
      }),
  };
}
